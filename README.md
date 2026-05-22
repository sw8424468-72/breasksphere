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

### Local
```bash
# Install dependencies
npm install
npm run dev
# open http://localhost:3000
```

### Environment
Create a local env file from the example (if present):

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
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
