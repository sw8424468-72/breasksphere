# breaksphere
*BreakSphere** is a live surf ops + recon web app — built for fast reads, tactical clarity, and field-ready deployment.
B## 🚀 Stack
- Next.js (React)
- TypeScript
- Node.js 20
- (Optional) OpenSearch integration

## 🛠️ Development
### Local
```bash
npm install
npm run deOpen http://localhost:3000

Codespaces
One-click start with the included .devcontainer

NodeOPENSEARCH_URL=
OS_USER=
OSdev — dev server

build — production build

start — run prod

 MVP homepage

 Search module
MIT © 2025 Legend


## B) `LICENSE` (root) — MIT
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
SOFTWARE.# dependencies
node_modules
# builds
.next
out
dist
# env
.env
.env.*
!.env.example
# misc
coverage
.DS_StoreOPENSEARCH_URL=
OS_USER=
OS_PASS=

 Map overlay

 Auth / sessions

 Deploy on Vercel
lint — lint_PASS= 20, ESLint, Prettiervase "name": "BreakSphere",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "postCreateCommand": "corepack enable && npm i || true",
  "customizations": {
    "vscode": {
      "extensions": ["esbenp.prettier-vscode","dbaeumer.vscode-eslint"]
    }
  }name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: corepack enable && npm i# initialize Next.js in-place
npm create next-app@latest . -- --ts --eslint --no-tailwind --src-dir --import-alias "@/*"

# simple MVP page
mkdir -p src/app
cat > src/app/page.tsx <<'TSX'
export default function Home() {
  return (
    <main style={{padding: 24}}>
      <h1>BreakSphere</h1>
      <p>Base Camp online. Barracks warm. Front Gate hot. Safe locked.</p>
    </main>
  );
}
TSX# sample env template already exists from above; make the real one locally if you plan to use search
cp -n .env.example .env.local 2>/dev/null || true

# commit
git add -A
git commit -m "init: Next.js TypeScript app + CI + devcontainer + docs"
git push
      - run: npm run build --if-present
}Camp online. Barracks warm. Front Gate hot. Safe locked.
