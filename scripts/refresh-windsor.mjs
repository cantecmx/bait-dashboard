// scripts/refresh-windsor.mjs
// Fetch datos BAIT desde Windsor.ai REST API y regenera bait-strategic-data.js
// Llamado por .github/workflows/refresh-windsor.yml a las 06:00 CDMX cada dia.
//
// Requiere Node 20+ (fetch nativo) y env var WINDSOR_API_KEY.

import { writeFileSync } from 'node:fs';

const apiKey = process.env.WINDSOR_API_KEY;
if (!apiKey) {
  console.error('ERROR: falta la env var WINDSOR_API_KEY');
  process.exit(1);
}

const ACCOUNT    = '3782742661970783';
const LEAD_FIELD = 'actions_onsite_conversion_messaging_conversation_started_7d';

// Rango: del 1 del mes actual hasta hoy (Ciudad de Mexico = UTC-6)
const now = new Date(Date.now() - 6 * 3600 * 1000);
const yyyy = now.getUTCFullYear();
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
const dd = String(now.getUTCDate()).padStart(2, '0');
const dateFrom = `${yyyy}-${mm}-01`;
const dateTo   = `${yyyy}-${mm}-${dd}`;
console.log(`[refresh] Periodo: ${dateFrom} a ${dateTo}`);

const base   = 'https://connectors.windsor.ai/all';
const common = `api_key=${encodeURIComponent(apiKey)}&date_from=${dateFrom}&date_to=${dateTo}`;

const queries = {
  daily:      `${base}?${common}&fields=account_id,date,spend,impressions,clicks,${LEAD_FIELD}`,
  demos:      `${base}?${common}&fields=account_id,age,gender,spend,impressions,clicks,frequency,${LEAD_FIELD}`,
  regions:    `${base}?${common}&fields=account_id,region,spend,impressions,clicks`,
  devices:    `${base}?${common}&fields=account_id,device_platform,publisher_platform,spend,impressions,clicks,${LEAD_FIELD}`,
  placements: `${base}?${common}&fields=account_id,publisher_platform,platform_position,spend,impressions,clicks,${LEAD_FIELD}`,
  hours:      `${base}?${common}&fields=account_id,hourly_stats_aggregated_by_advertiser_time_zone,spend,impressions,clicks,${LEAD_FIELD}`,
  ads:        `${base}?${common}&fields=account_id,ad_name,campaign,spend,impressions,clicks,frequency,${LEAD_FIELD}`
};

async function fetchOne(label, url) {
  console.log(`[refresh] -> ${label}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${label} HTTP ${res.status}: ${body.substring(0, 300)}`);
    }
    const json = await res.json();
    let rows = Array.isArray(json) ? json : (json.data || json.rows || []);
    rows = rows.filter(r => String(r.account_id || '') === ACCOUNT);
    console.log(`[refresh] <- ${label} rows=${rows.length}`);
    return rows;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

const settled = await Promise.allSettled(
  Object.entries(queries).map(([k, u]) => fetchOne(k, u).then(rows => [k, rows]))
);

const results = {};
const errors = [];
settled.forEach((s, i) => {
  const key = Object.keys(queries)[i];
  if (s.status === 'fulfilled') results[key] = s.value[1];
  else errors.push(`${key}: ${s.reason.message || s.reason}`);
});
if (errors.length) {
  console.error('[refresh] ERRORES:\n  ' + errors.join('\n  '));
  process.exit(1);
}

// === Transformacion al shape D ===
const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

const daily = (results.daily || []).map(r => {
  const leads = +(r[LEAD_FIELD] || 0);
  const spend = +(r.spend || 0);
  const clicks = +(r.clicks || 0);
  const impr = +(r.impressions || 0);
  const dt = new Date(r.date + 'T00:00:00Z');
  const label = `${dayNames[dt.getUTCDay()]} ${String(dt.getUTCDate()).padStart(2, '0')}`;
  return {
    date: r.date, label, spend, impressions: impr, clicks,
    ctr: impr ? clicks / impr : 0,
    cpm: impr ? (spend / impr) * 1000 : 0,
    leads, cpl: leads ? spend / leads : 0,
    partial: r.date === dateTo
  };
}).sort((a, b) => a.date.localeCompare(b.date));

const demographics = (results.demos || []).map(r => {
  const leads = +(r[LEAD_FIELD] || 0), spend = +(r.spend || 0),
        impr = +(r.impressions || 0), clicks = +(r.clicks || 0);
  return {
    age: r.age, gender: r.gender, spend, impressions: impr, clicks,
    ctr: impr ? clicks / impr : 0,
    cpm: impr ? (spend / impr) * 1000 : 0,
    frequency: +(r.frequency || 0),
    leads, cpl: leads ? spend / leads : 0
  };
});

const regions = (results.regions || []).map(r => {
  const spend = +(r.spend || 0), impr = +(r.impressions || 0), clicks = +(r.clicks || 0);
  return {
    region: r.region, spend, impressions: impr, clicks,
    ctr: impr ? clicks / impr : 0,
    cpm: impr ? (spend / impr) * 1000 : 0
  };
}).sort((a, b) => b.spend - a.spend);

const placements = (results.placements || []).map(r => {
  const leads = +(r[LEAD_FIELD] || 0), spend = +(r.spend || 0),
        impr = +(r.impressions || 0), clicks = +(r.clicks || 0);
  return {
    platform: r.publisher_platform, position: r.platform_position,
    spend, impressions: impr, clicks,
    ctr: impr ? clicks / impr : 0,
    cpm: impr ? (spend / impr) * 1000 : 0,
    leads, cpl: leads ? spend / leads : 0
  };
}).filter(p => p.leads > 0 || p.spend > 50);

const hours = (results.hours || []).map(r => {
  const hourStr = r.hourly_stats_aggregated_by_advertiser_time_zone || '00:00:00';
  const hour = parseInt(hourStr.split(':')[0], 10);
  const leads = +(r[LEAD_FIELD] || 0), spend = +(r.spend || 0),
        impr = +(r.impressions || 0), clicks = +(r.clicks || 0);
  return {
    hour, label: String(hour).padStart(2, '0') + 'h',
    spend, impressions: impr, clicks, leads,
    cpl: leads ? spend / leads : 0
  };
}).sort((a, b) => a.hour - b.hour);

const ads = (results.ads || []).map(r => {
  const leads = +(r[LEAD_FIELD] || 0), spend = +(r.spend || 0),
        impr = +(r.impressions || 0), clicks = +(r.clicks || 0);
  return {
    ad: r.ad_name, campaign: r.campaign,
    spend, impressions: impr,
    ctr: impr ? clicks / impr : 0,
    frequency: +(r.frequency || 0),
    leads, cpl: leads ? spend / leads : 0
  };
}).filter(a => a.leads > 0).sort((a, b) => a.cpl - b.cpl);

const devices = (results.devices || []).map(r => {
  const leads = +(r[LEAD_FIELD] || 0), spend = +(r.spend || 0),
        impr = +(r.impressions || 0), clicks = +(r.clicks || 0);
  const dev = r.device_platform || 'unknown';
  return {
    device: dev + (r.publisher_platform ? ` (${r.publisher_platform.toUpperCase().slice(0, 2)})` : ''),
    platform: r.publisher_platform,
    spend, impressions: impr, clicks,
    ctr: impr ? clicks / impr : 0,
    cpm: impr ? (spend / impr) * 1000 : 0,
    leads, cpl: leads ? spend / leads : 0
  };
});

// Weekdays agregado desde daily
const wd = dayNames.map((n, i) => ({ day: n, dayNum: i, spend: 0, impressions: 0, clicks: 0, leads: 0 }));
daily.forEach(d => {
  const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
  wd[dow].spend += d.spend;
  wd[dow].impressions += d.impressions;
  wd[dow].clicks += d.clicks;
  wd[dow].leads += d.leads;
});
const weekdays = wd.map(a => ({
  ...a,
  ctr: a.impressions ? a.clicks / a.impressions : 0,
  cpm: a.impressions ? (a.spend / a.impressions) * 1000 : 0,
  cpl: a.leads ? a.spend / a.leads : 0
}));

// Meta
const completeCount = daily.filter(d => !d.partial).length;
const updatedAt = `${dateTo} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
const meta = {
  dateRange: `${dateFrom} a ${dateTo}`,
  daysReal: daily.length,
  daysComplete: completeCount,
  daysRemaining: 30 - daily.length,  // aprox para meses de 30 dias; ajustar si se cambia el mes
  updatedAt,
  account: ACCOUNT,
  note: `Auto-refresh diario via GitHub Actions · ${dateTo} parcial`
};

const dataObject = {
  meta,
  demographics,
  regions,
  devices,
  placements,
  hours,
  weekdays,
  ads,
  daily
};

// Construir el archivo .js manteniendo el formato esperado por el dashboard
const out = `// BAIT Strategic Data — ${meta.dateRange} (auto-refresh GitHub Actions)
// Actualizado: ${updatedAt} · Cuenta: ${ACCOUNT}
// Base promedios: ${completeCount} dias completos via Windsor.ai REST
window.BAIT_STRATEGIC = ${JSON.stringify(dataObject, null, 2)};
`;

writeFileSync('bait-strategic-data.js', out, 'utf8');
console.log(`[refresh] OK — bait-strategic-data.js regenerado (${daily.length} dias, ${completeCount} completos)`);
