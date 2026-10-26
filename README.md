# DIV Modpack Builder

A React + Vite web app that searches Modrinth, filters mods by Minecraft version and loader, resolves required dependencies, and bundles JAR files into a ZIP.

## Requirements

- Node.js 20 or newer recommended
- npm
- Internet connection

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

The production site is generated in `dist/`.

## Features

- Modrinth project search
- Minecraft version, loader, and sort filters
- Adds compatible JAR versions
- Optional recursive resolution of `required` dependencies
- Checks required dependency versions against selected Minecraft version and loader
- Creates `div-mods-<minecraft-version>-<loader>.zip`
- ZIP contains a `mods/` directory and `manifest.json`
- Responsive dark UI

## Important compatibility notes

- This app exports JAR files, not a complete game installation.
- Users must install the correct Minecraft version and mod loader separately.
- Some dependencies are external, unavailable on Modrinth, optional, or incompatible. Dependency resolution stops with an error if a required dependency cannot be safely resolved.
- Some file hosts or browser policies may block cross-origin downloads. If that happens, the app reports an error instead of silently creating an incomplete archive.
- A modpack can still fail in-game because of conflicts not represented in Modrinth metadata, Java requirements, configuration needs, or unsupported Minecraft versions.
- The selected mods are cleared when Minecraft version or loader changes to avoid accidentally mixing incompatible selections.

## Deployment

Build with `npm run build`, then deploy the `dist/` directory to Cloudflare Pages, Netlify, or another static hosting provider. No API token is required for normal Modrinth search and version reads.

## Modrinth API

This project uses the public Modrinth API v2:
- https://docs.modrinth.com/api/
- https://docs.modrinth.com/api/operations/searchprojects/
- https://docs.modrinth.com/api/operations/getprojectversions/

Please respect Modrinth's API rules and terms. This project is not affiliated with Mojang, Microsoft, or Modrinth.
