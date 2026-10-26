# DIV Modpack Builder

React + Vite website for discovering Minecraft mods through Modrinth, checking versions/loaders, resolving required dependencies, and exporting selected JAR files into a ZIP.

## Cloudflare Workers (GitHub-connected Builds) — recommended for your current setup

This repository includes `wrangler.jsonc` configured to serve Vite's `dist/` output as static assets, including SPA fallback.

In Cloudflare, open your Worker project and configure the Git-connected build: 

- **Root directory:** `/` if `package.json` and `index.html` are at the top level of the repository.
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy` (if your dashboard shows a deploy command field)
- **Preview command:** use `npx wrangler dev` if the field is specifically for local/preview execution; do not use `npx wrangler preview` as the production deploy command.

Make sure the Worker deployment uses the `wrangler.jsonc` file in this repository. It serves the built site from `dist/`. After committing these files, trigger a new deployment and open the latest deployment URL.

If you instead use **Cloudflare Pages**, use build command `npm run build` and output directory `dist`. Pages does not need the Workers `wrangler deploy` command.

## Run locally / build

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Features

- Modrinth project search, Minecraft version and loader filters, sorting
- Compatible JAR version selection
- Optional recursive resolution of required dependencies
- Dependency compatibility checks
- ZIP export with a `mods/` directory and `manifest.json`
- Responsive dark UI

## Notes

- This app exports mod JARs, not a complete Minecraft installation. Install the matching Minecraft version and mod loader separately.
- Modrinth's public API is used; no API token is required for normal search and version reads.
- Browser cross-origin restrictions or host download failures may prevent some JARs from downloading; check the app's error message if that happens.
- Mod metadata cannot guarantee that all selected mods work together in-game.
