# SurfCaddy

![SurfCaddy logo](assets/surfcaddy-logo.svg)

SurfCaddy is a live surf ops + recon web app built for fast reads, tactical clarity, and field-ready deployment.

> **Repository note:** This is the single source-of-truth repository for SurfCaddy.
> Use only this repo for updates and sharing to avoid version confusion.

## ✅ New Build (Current)
This repository contains the current SurfCaddy build.
Use this repository only for active development, docs, and release work.

## 🚀 Stack
- Next.js (React)
- TypeScript
- Node.js 20
- Optional OpenSearch integration

## 🛠️ Development

### Local
```bash
npm install
npm run dev
# open http://localhost:3000
```

### Environment
Create a local env file from the example (if present):

```bash
cp -n .env.example .env.local 2>/dev/null || true
```

Expected variables:

```bash
OPENSEARCH_URL=
OS_USER=
OS_PASS=
```

## Scripts
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run production server
- `npm run lint` — run lint checks

## Roadmap
- MVP homepage
- Search module
- Map overlay
- Auth / sessions
- Vercel deployment

## License
MIT © 2025 Legend
