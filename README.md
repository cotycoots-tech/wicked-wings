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

- `PORT` — listen port (default `3847`)
