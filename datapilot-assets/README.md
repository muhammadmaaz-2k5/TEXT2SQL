# DataPilot AI - Asset Pack

Brand: **DataPilot AI - Talk to your database.**

## Contents
- `logo/` - mark, horizontal + tagline logos (light/dark/mono), 1024px PNG
- `favicons/` - favicon.svg/.ico, PNG 16-512, apple-touch-icon, webmanifest, head snippet, og-image.png
- `icons/` - 72 custom SVG icons in 5 folders (db, charts, ai, security, ui), `sprite.svg`, React `Icon.tsx`, `_preview.html` (open in browser)
- `illustrations/` - hero, pipeline, ER diagram, empty/error/404 states (light + dark)
- `social/` - 1200x630 OG image (SVG + PNG)
- `fonts/` - Bricolage Grotesque (display), IBM Plex Sans (body), JetBrains Mono (SQL/code) as woff2, all OFL licensed
- `styles/` - fonts.css, tokens.css (light/dark), base.css, components.css (buttons, inputs, cards, badges, prompt bar, SQL block, table, KPI, nav)
- `config/` - Tailwind preset, chart palette, Monaco SQL editor themes (light/dark), next/font alternative

## Palette
Pilot Blue `#2F5BFF` | Altitude Amber `#FFB020` | Ink `#101828` | Paper `#F6F8FB` | Navy `#0B1220`
Status: success `#12B76A`, warning `#F79009`, danger `#F04438`

## Quick start (Next.js)
1. Copy `fonts/` -> `public/fonts/`, `favicons/*` -> `public/`
2. Import `styles/base.css` in your root layout/global CSS
3. Add `config/tailwind.preset.js` as a Tailwind preset
4. Use icons: copy `icons/Icon.tsx` -> `<Icon name="database" />`
5. Monaco: `monaco.editor.defineTheme('datapilot-dark', require('./monaco-theme-datapilot-dark.json'))`

Icons use `currentColor`, so colour them with CSS/Tailwind text colour.
