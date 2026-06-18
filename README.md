# BAIT · Dashboard Estrategico Meta Ads

Dashboard analitico para la campana de portabilidad BAIT (Meta Ads) operada por Grupo Cantec. Visualiza demograficos, regiones, dispositivos, placements, horarios y creativos del periodo en curso, con escenarios de pronostico al cierre del mes.

## Stack

HTML + CSS + JavaScript vanilla + [Chart.js 4.4.1](https://www.chartjs.org/) (via CDN). Sin build, sin dependencias locales. Se sirve como estatico.

## Estructura

```
.
├── index.html               # Dashboard
├── bait-strategic-data.js   # Datos del periodo (Windsor.ai)
└── README.md
```

## Datos

Los numeros vienen de [Windsor.ai](https://windsor.ai/) (conector `facebook`, cuenta BAIT). La metrica de lead es `actions_onsite_conversion_messaging_conversation_started_7d` (mensajes iniciados, Click-to-Message).

El dashboard incluye un boton **↻ Actualizar** que consume directo el REST API de Windsor con tu propia API key (guardada en localStorage del navegador, nunca en este repo).

## Configurar API key (para refresh en vivo)

1. Abre el dashboard.
2. Click en el icono ⚙ a la derecha del selector de mes.
3. Pega tu API key de Windsor (la encuentras en https://onboard.windsor.ai → Settings → API).
4. Click Guardar.
5. Click ↻ Actualizar.

Si Windsor bloquea por CORS al servir desde GitHub Pages, abre un issue o sirvelo desde un dominio propio.

## Hosting

Configurado para [GitHub Pages](https://pages.github.com/). El dashboard queda accesible en:

```
https://<usuario>.github.io/<repo>/
```

## Cambios

- **2026-06**: pronostico cierre de junio (16-30 jun), selector de meses, boton de refresh contra Windsor REST, secciones colapsables.

## Autor

[Grupo Cantec](https://grupocantec.com) · contacto@grupocantec.com
