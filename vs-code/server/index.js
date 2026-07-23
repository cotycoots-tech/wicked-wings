const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { v4: uuid } = require('uuid');
const { read, update, ensureDb } = require('./store');
const {
  COOKIE_NAME,
  createSession,
  destroySession,
  getSessionUser,
  sanitizeUser,
  verifyPassword,
  hashPassword,
  requireAuth,
  requireRole,
  canWrite
} = require('./auth');

ensureDb();

const app = express();
const PORT = process.env.PORT || 3847;

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

function now() {
  return new Date().toISOString();
}

function requireWrite(req, res, next) {
  if (!canWrite(req.user.role)) {
    return res.status(403).json({ error: 'Write access requires engineer or admin role' });
  }
  next();
}

// ── Auth ──────────────────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  const user = getSessionUser(req.cookies?.[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const db = read();
  const user = db.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user || !(await verifyPassword(user, password))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const { token, expiresAt } = createSession(user.id);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: expiresAt - Date.now()
  });
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/logout', (req, res) => {
  destroySession(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'username, password, and displayName required' });
  }
  const allowed = ['admin', 'engineer', 'viewer'];
  const userRole = allowed.includes(role) ? role : 'viewer';
  const db = read();
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const user = {
    id: uuid(),
    username: username.trim(),
    displayName: displayName.trim(),
    role: userRole,
    passwordHash: await hashPassword(password),
    createdAt: now()
  };
  update((d) => {
    d.users.push(user);
  });
  res.status(201).json({ user: sanitizeUser(user) });
});

app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = read().users.map(sanitizeUser);
  res.json({ users });
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Valid current and new password (min 6 chars) required' });
  }
  const db = read();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user || !(await verifyPassword(user, currentPassword))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = await hashPassword(newPassword);
  update((d) => {
    const u = d.users.find((x) => x.id === req.user.id);
    if (u) u.passwordHash = hash;
  });
  res.json({ ok: true });
});

// ── Dashboard summary ─────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, (req, res) => {
  const db = read();
  const kpis = db.kpis;
  const onTarget = kpis.filter((k) => {
    if (k.current === 0 && k.category) return false;
    if (k.direction === 'lower_is_better') return k.current > 0 && k.current <= k.target;
    return k.current >= k.target;
  }).length;
  res.json({
    counts: {
      inventory: db.inventory.length,
      networkConfigs: db.networkConfigs.length,
      softwarePackages: db.softwarePackages.length,
      cells: db.cells.length,
      kpis: kpis.length,
      users: db.users.length
    },
    cellsByStatus: db.cells.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {}),
    inventoryByCategory: db.inventory.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] || 0) + 1;
      return acc;
    }, {}),
    lowStock: db.inventory.filter((i) => i.quantityOnHand < 3),
    kpiSummary: { total: kpis.length, onTarget, offTarget: kpis.length - onTarget },
    recentCells: [...db.cells].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  });
});

// ── Inventory ─────────────────────────────────────────────────────
app.get('/api/inventory', requireAuth, (req, res) => {
  const { category, q } = req.query;
  let items = read().inventory;
  if (category) items = items.filter((i) => i.category === category);
  if (q) {
    const s = String(q).toLowerCase();
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(s) ||
        i.partNumber.toLowerCase().includes(s) ||
        i.vendor.toLowerCase().includes(s)
    );
  }
  res.json({ items });
});

app.get('/api/inventory/:id', requireAuth, (req, res) => {
  const item = read().inventory.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

app.post('/api/inventory', requireAuth, requireWrite, (req, res) => {
  const { category, name, partNumber, vendor, quantityOnHand, unitCost, specs, status } = req.body || {};
  if (!category || !name || !partNumber || !vendor) {
    return res.status(400).json({ error: 'category, name, partNumber, vendor required' });
  }
  const item = {
    id: uuid(),
    category,
    name,
    partNumber,
    vendor,
    quantityOnHand: Number(quantityOnHand) || 0,
    unitCost: Number(unitCost) || 0,
    specs: specs && typeof specs === 'object' ? specs : {},
    status: status || (Number(quantityOnHand) > 0 ? 'available' : 'out_of_stock'),
    createdAt: now(),
    updatedAt: now()
  };
  update((d) => d.inventory.push(item));
  res.status(201).json({ item });
});

app.put('/api/inventory/:id', requireAuth, requireWrite, (req, res) => {
  let updated = null;
  update((d) => {
    const idx = d.inventory.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return;
    const prev = d.inventory[idx];
    const body = req.body || {};
    updated = {
      ...prev,
      category: body.category ?? prev.category,
      name: body.name ?? prev.name,
      partNumber: body.partNumber ?? prev.partNumber,
      vendor: body.vendor ?? prev.vendor,
      quantityOnHand: body.quantityOnHand !== undefined ? Number(body.quantityOnHand) : prev.quantityOnHand,
      unitCost: body.unitCost !== undefined ? Number(body.unitCost) : prev.unitCost,
      specs: body.specs !== undefined ? body.specs : prev.specs,
      status: body.status ?? prev.status,
      updatedAt: now()
    };
    d.inventory[idx] = updated;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ item: updated });
});

app.delete('/api/inventory/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = read();
  const refs = [
    ...new Set(
      (db.cells || [])
        .filter((c) => (c.inventoryItems || []).some((r) => r.inventoryId === req.params.id))
        .map((c) => c.name)
    )
  ];
  if (refs.length) {
    return res.status(409).json({
      error: `Cannot delete: item is used in work cell BOM(s): ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? '…' : ''}`
    });
  }
  let removed = false;
  update((d) => {
    const before = d.inventory.length;
    d.inventory = d.inventory.filter((i) => i.id !== req.params.id);
    removed = d.inventory.length < before;
  });
  if (!removed) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Network configs ───────────────────────────────────────────────
app.get('/api/network', requireAuth, (req, res) => {
  res.json({ configs: read().networkConfigs });
});

app.get('/api/network/:id', requireAuth, (req, res) => {
  const config = read().networkConfigs.find((c) => c.id === req.params.id);
  if (!config) return res.status(404).json({ error: 'Not found' });
  res.json({ config });
});

app.post('/api/network', requireAuth, requireWrite, (req, res) => {
  const { name, description, vlanId, subnet, gateway, dns, components, notes } = req.body || {};
  if (!name || !subnet || !gateway) {
    return res.status(400).json({ error: 'name, subnet, and gateway required' });
  }
  const config = {
    id: uuid(),
    name,
    description: description || '',
    vlanId: Number(vlanId) || 0,
    subnet,
    gateway,
    dns: Array.isArray(dns) ? dns : [],
    components: Array.isArray(components) ? components : [],
    notes: notes || '',
    createdAt: now(),
    updatedAt: now()
  };
  update((d) => d.networkConfigs.push(config));
  res.status(201).json({ config });
});

app.put('/api/network/:id', requireAuth, requireWrite, (req, res) => {
  let updated = null;
  update((d) => {
    const idx = d.networkConfigs.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return;
    const prev = d.networkConfigs[idx];
    const body = req.body || {};
    updated = {
      ...prev,
      name: body.name ?? prev.name,
      description: body.description ?? prev.description,
      vlanId: body.vlanId !== undefined ? Number(body.vlanId) : prev.vlanId,
      subnet: body.subnet ?? prev.subnet,
      gateway: body.gateway ?? prev.gateway,
      dns: body.dns !== undefined ? body.dns : prev.dns,
      components: body.components !== undefined ? body.components : prev.components,
      notes: body.notes ?? prev.notes,
      updatedAt: now()
    };
    d.networkConfigs[idx] = updated;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ config: updated });
});

app.delete('/api/network/:id', requireAuth, requireRole('admin'), (req, res) => {
  let removed = false;
  update((d) => {
    const before = d.networkConfigs.length;
    d.networkConfigs = d.networkConfigs.filter((c) => c.id !== req.params.id);
    removed = d.networkConfigs.length < before;
  });
  if (!removed) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Software packages ─────────────────────────────────────────────
app.get('/api/software', requireAuth, (req, res) => {
  const { category, q } = req.query;
  let packages = read().softwarePackages;
  if (category) packages = packages.filter((p) => p.category === category);
  if (q) {
    const s = String(q).toLowerCase();
    packages = packages.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.vendor.toLowerCase().includes(s) ||
        p.version.toLowerCase().includes(s)
    );
  }
  res.json({ packages });
});

app.post('/api/software', requireAuth, requireWrite, (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.version || !body.category || !body.vendor) {
    return res.status(400).json({ error: 'name, version, category, vendor required' });
  }
  const pkg = {
    id: uuid(),
    name: body.name,
    version: body.version,
    category: body.category,
    vendor: body.vendor,
    licenseType: body.licenseType || '',
    compatibleHardware: Array.isArray(body.compatibleHardware) ? body.compatibleHardware : [],
    installPath: body.installPath || '',
    notes: body.notes || '',
    createdAt: now(),
    updatedAt: now()
  };
  update((d) => d.softwarePackages.push(pkg));
  res.status(201).json({ package: pkg });
});

app.put('/api/software/:id', requireAuth, requireWrite, (req, res) => {
  let updated = null;
  update((d) => {
    const idx = d.softwarePackages.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return;
    const prev = d.softwarePackages[idx];
    const body = req.body || {};
    updated = {
      ...prev,
      name: body.name ?? prev.name,
      version: body.version ?? prev.version,
      category: body.category ?? prev.category,
      vendor: body.vendor ?? prev.vendor,
      licenseType: body.licenseType ?? prev.licenseType,
      compatibleHardware: body.compatibleHardware !== undefined ? body.compatibleHardware : prev.compatibleHardware,
      installPath: body.installPath ?? prev.installPath,
      notes: body.notes ?? prev.notes,
      updatedAt: now()
    };
    d.softwarePackages[idx] = updated;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ package: updated });
});

app.delete('/api/software/:id', requireAuth, requireRole('admin'), (req, res) => {
  let removed = false;
  update((d) => {
    const before = d.softwarePackages.length;
    d.softwarePackages = d.softwarePackages.filter((p) => p.id !== req.params.id);
    removed = d.softwarePackages.length < before;
  });
  if (!removed) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Work cells ────────────────────────────────────────────────────
app.get('/api/cells', requireAuth, (req, res) => {
  const db = read();
  const cells = db.cells.map((cell) => enrichCell(cell, db));
  res.json({ cells });
});

app.get('/api/cells/:id', requireAuth, (req, res) => {
  const db = read();
  const cell = db.cells.find((c) => c.id === req.params.id);
  if (!cell) return res.status(404).json({ error: 'Not found' });
  res.json({ cell: enrichCell(cell, db), kpis: db.kpis.filter((k) => k.cellId === cell.id) });
});

function enrichCell(cell, db) {
  const inventoryDetails = (cell.inventoryItems || []).map((row) => {
    const item = db.inventory.find((i) => i.id === row.inventoryId);
    return { ...row, item: item || null };
  });
  const network = db.networkConfigs.find((n) => n.id === cell.networkConfigId) || null;
  const software = (cell.softwarePackageIds || [])
    .map((id) => db.softwarePackages.find((p) => p.id === id))
    .filter(Boolean);
  const kpis = db.kpis.filter((k) => k.cellId === cell.id);
  return { ...cell, inventoryDetails, network, software, kpis };
}

app.post('/api/cells', requireAuth, requireWrite, (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: 'name required' });
  const cell = {
    id: uuid(),
    name: body.name,
    description: body.description || '',
    status: body.status || 'design',
    customer: body.customer || '',
    location: body.location || '',
    inventoryItems: Array.isArray(body.inventoryItems) ? body.inventoryItems : [],
    networkConfigId: body.networkConfigId || null,
    softwarePackageIds: Array.isArray(body.softwarePackageIds) ? body.softwarePackageIds : [],
    owner: req.user.username,
    createdAt: now(),
    updatedAt: now()
  };
  update((d) => d.cells.push(cell));
  res.status(201).json({ cell: enrichCell(cell, read()) });
});

app.put('/api/cells/:id', requireAuth, requireWrite, (req, res) => {
  let updated = null;
  update((d) => {
    const idx = d.cells.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return;
    const prev = d.cells[idx];
    const body = req.body || {};
    updated = {
      ...prev,
      name: body.name ?? prev.name,
      description: body.description ?? prev.description,
      status: body.status ?? prev.status,
      customer: body.customer ?? prev.customer,
      location: body.location ?? prev.location,
      inventoryItems: body.inventoryItems !== undefined ? body.inventoryItems : prev.inventoryItems,
      networkConfigId: body.networkConfigId !== undefined ? body.networkConfigId : prev.networkConfigId,
      softwarePackageIds:
        body.softwarePackageIds !== undefined ? body.softwarePackageIds : prev.softwarePackageIds,
      updatedAt: now()
    };
    d.cells[idx] = updated;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ cell: enrichCell(updated, read()) });
});

app.delete('/api/cells/:id', requireAuth, requireRole('admin'), (req, res) => {
  let removed = false;
  update((d) => {
    const before = d.cells.length;
    d.cells = d.cells.filter((c) => c.id !== req.params.id);
    d.kpis = d.kpis.filter((k) => k.cellId !== req.params.id);
    removed = d.cells.length < before;
  });
  if (!removed) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── KPIs ──────────────────────────────────────────────────────────
app.get('/api/kpis', requireAuth, (req, res) => {
  const db = read();
  let kpis = db.kpis;
  if (req.query.cellId) kpis = kpis.filter((k) => k.cellId === req.query.cellId);
  const enriched = kpis.map((k) => ({
    ...k,
    cellName: db.cells.find((c) => c.id === k.cellId)?.name || 'Unknown',
    onTarget: isOnTarget(k)
  }));
  res.json({ kpis: enriched });
});

function isOnTarget(k) {
  if (k.current === 0 && k.direction === 'lower_is_better' && k.target > 0) return false;
  if (k.direction === 'lower_is_better') return k.current > 0 && k.current <= k.target;
  return k.current >= k.target;
}

app.post('/api/kpis', requireAuth, requireWrite, (req, res) => {
  const body = req.body || {};
  if (!body.cellId || !body.name || body.target === undefined) {
    return res.status(400).json({ error: 'cellId, name, and target required' });
  }
  const db = read();
  if (!db.cells.some((c) => c.id === body.cellId)) {
    return res.status(400).json({ error: 'Invalid cellId' });
  }
  const kpi = {
    id: uuid(),
    cellId: body.cellId,
    name: body.name,
    unit: body.unit || '',
    target: Number(body.target),
    current: Number(body.current) || 0,
    direction: body.direction === 'lower_is_better' ? 'lower_is_better' : 'higher_is_better',
    category: body.category || 'general',
    notes: body.notes || '',
    updatedAt: now()
  };
  update((d) => d.kpis.push(kpi));
  res.status(201).json({ kpi: { ...kpi, onTarget: isOnTarget(kpi) } });
});

app.put('/api/kpis/:id', requireAuth, requireWrite, (req, res) => {
  let updated = null;
  update((d) => {
    const idx = d.kpis.findIndex((k) => k.id === req.params.id);
    if (idx === -1) return;
    const prev = d.kpis[idx];
    const body = req.body || {};
    updated = {
      ...prev,
      name: body.name ?? prev.name,
      unit: body.unit ?? prev.unit,
      target: body.target !== undefined ? Number(body.target) : prev.target,
      current: body.current !== undefined ? Number(body.current) : prev.current,
      direction: body.direction ?? prev.direction,
      category: body.category ?? prev.category,
      notes: body.notes ?? prev.notes,
      cellId: body.cellId ?? prev.cellId,
      updatedAt: now()
    };
    d.kpis[idx] = updated;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ kpi: { ...updated, onTarget: isOnTarget(updated) } });
});

app.delete('/api/kpis/:id', requireAuth, requireWrite, (req, res) => {
  let removed = false;
  update((d) => {
    const before = d.kpis.length;
    d.kpis = d.kpis.filter((k) => k.id !== req.params.id);
    removed = d.kpis.length < before;
  });
  if (!removed) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// SPA fallback for app routes (not API)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Vision Cell Builder running at http://localhost:${PORT}`);
});
