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

## Deploy on Railway

This app is configured for [Railway](https://railway.app) via `railway.toml` (Python stdlib server).

### One-time setup (dashboard)

1. Push this repo to GitHub (if it is not already).
2. Go to [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo** → select this project.
3. Railway will build with Railpack and start with:
   ```
   python server/app.py
   ```
4. Open the service → **Settings** → **Networking** → **Generate Domain**.
5. Visit the public URL (HTTPS). Log in with a demo account above.

### CLI alternative

```bash
# Install: https://docs.railway.com/guides/cli
railway login
railway init          # link or create a project
railway up            # deploy from the current directory
railway domain        # generate a public domain
```

### What gets deployed

| File | Role |
|------|------|
| `railway.toml` | Start command + healthcheck (`/health`) |
| `requirements.txt` | Marks the service as Python (no pip deps) |
| `runtime.txt` | Preferred Python version hint |
| `server/app.py` | API + static file server |
| `public/` | Frontend |
| `data/db.json` | Seeded on first boot if missing |

### Data persistence note

`data/db.json` lives on the container filesystem. **Redeploys can wipe local data** unless you attach a [Railway volume](https://docs.railway.com/reference/volumes) mounted at `/app/data` (or the service’s working-directory `data` path).

For a durable store later, move to Postgres or another managed database.
