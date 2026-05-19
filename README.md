# SURFCADDY

**SURFCADDY** is a live surf ops + recon web app — built for fast reads, tactical clarity, and field-ready deployment.

## 🚀 Stack

- Next.js (React)
- TypeScript
- Node.js 20
- Leaflet + OpenStreetMap (interactive world map)
- (Optional) OpenSearch integration

## 🗺️ Interactive Map Features

- **OpenStreetMap Integration**: Real-time world map powered by Leaflet
- **Interactive Overlays**: Mark locations, regions, and tactical positions
- **Responsive Design**: Mobile-friendly map interface
- **Location Search**: Find and navigate to specific coordinates

## 🛠️ Development

### Local Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Codespaces

One-click start with the included `.devcontainer`

### Environment Variables

```env
OPENSTREETMAP_API_URL=https://tile.openstreetmap.org
# Optional: OpenSearch integration
OPENSEARCH_URL=
OS_USER=
OS_PASS=
```

## 📋 Available Scripts

- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm start` — Run production server
- `npm run lint` — Lint with ESLint and Prettier

## 📦 Core Features

- ✅ MVP homepage
- 🗺️ Interactive world map (Leaflet + OpenStreetMap)
- 🔍 Search module
- 🔐 Auth / sessions
- 📍 Map overlay
- 🚀 Deploy on Vercel

## 📝 License

MIT © 2025 Legend

```text
MIT License

Copyright (c) 2025 Legend

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
