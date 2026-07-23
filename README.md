# Vision Cell Builder

Internal full-stack tool for planning and tracking **vision-guided robotic work cell** builds.

## Features

| Module | Description |
|--------|-------------|
| **Work Cells** | Cell builds with BOM, network assignment, software stack, and status |
| **Inventory Catalog** | Robots, cameras, lighting, PLCs, grippers, conveyors, lenses, PCs |
| **Network Configs** | Unique VLAN/subnet layouts and per-component IP / hostname / ports |
| **Software Packages** | Vision, robot, PLC, and runtime software versions |
| **KPI Goals** | Cycle time, yield, OEE, and other targets vs current values |
| **Auth** | Login sessions, roles (admin / engineer / viewer), password change |

## Stack

- **Frontend:** HTML, CSS, vanilla JavaScript (SPA)
- **Backend:** Python 3 standard library HTTP server (no pip packages required)
- **Data:** JSON file store (`data/db.json`)

> Optional Node.js backend is also included (`server/index.js`) if you prefer `npm start`.

## Quick start (Python — recommended)

```bash
python3 server/app.py
```

Open **http://localhost:3847**

On first run the database is seeded automatically.

### Demo accounts

| Username  | Password     | Role     |
|-----------|--------------|----------|
| `admin`     | `admin123`     | admin    |
| `engineer`  | `engineer123`  | engineer |
| `viewer`    | `viewer123`    | viewer   |

## Roles

- **admin** — full CRUD, user management, deletes
- **engineer** — create and edit cells, inventory, network, software, KPIs
- **viewer** — read-only

## Optional Node.js path

```bash
npm install
npm run seed
npm start
```

## Project layout

```
public/           HTML, CSS, JS frontend
server/app.py     Python API + static server (primary)
server/index.js   Express API (optional)
data/db.json      Persistent store (auto-created)
```

## Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Listen port (Railway sets this automatically) | `3847` |
| `HOST` | Bind address | `0.0.0.0` |
| `COOKIE_SECURE` | Force `Secure` session cookies (`true`/`1`) | auto on Railway |

## Deploy on Railway (recommended path)

Configured via `Dockerfile` + `railway.toml`. Production service is connected to **GitHub** (`cotycoots-tech/wicked-wings` → `main`).

### One-time setup

1. **Push to GitHub** — repo at https://github.com/cotycoots-tech/wicked-wings
2. **Railway → Deploy from GitHub** — service source: `cotycoots-tech/wicked-wings` branch `main`
3. **Generate domain** — e.g. `https://vision-cell-builder-production.up.railway.app`
4. **Done** — each push to `main` rebuilds and deploys automatically

```bash
git push origin main   # triggers Railway deploy
```

### CLI alternative (optional)

```bash
# Install: https://docs.railway.com/guides/cli
railway login
railway init
railway up
railway domain
# Link existing service to GitHub:
railway service source connect --repo cotycoots-tech/wicked-wings --branch main
```

### What gets deployed

| File | Role |
|------|------|
| `Dockerfile` | Python 3.12 image used by Railway builds |
| `railway.toml` | Builder, start command, healthcheck (`/health`) |
| `requirements.txt` | No pip deps (stdlib only); kept for tooling |
| `server/app.py` | API + static file server |
| `public/` | Frontend |
| `data/db.json` | Seeded on first boot if missing |

### Data persistence (Railway volume)

Production attaches a [Railway volume](https://docs.railway.com/reference/volumes) at **`/app/data`** so `data/db.json` survives redeploys.

```bash
# Create / re-check (already done for vision-cell-builder)
railway volume -s <service-id> add -m /app/data
railway volume list
```

- Empty volume on first boot: the app **auto-seeds** demo users and catalog data.
- Image-baked `COPY data` is hidden when the volume is mounted (expected).
- Volume size default is 500 MB (enough for JSON).

For multi-instance or heavier durability later, move to Postgres or another managed database.
