/* Vision Cell Builder – main app */
const state = {
  user: null,
  view: 'dashboard',
  cache: {}
};

const VIEW_META = {
  dashboard: { title: 'Dashboard', desc: 'Overview of cell builds, inventory, and KPI targets' },
  cells: { title: 'Work Cells', desc: 'Vision-guided robotic cell builds and BOM composition' },
  inventory: { title: 'Inventory Catalog', desc: 'Robots, cameras, lighting, PLCs, grippers, and more' },
  network: { title: 'Network Configurations', desc: 'Unique IP schemes and component endpoints per cell' },
  software: { title: 'Software Packages', desc: 'Vision, robot, PLC, and runtime software versions' },
  kpis: { title: 'KPI Goals', desc: 'Cycle time, quality, and efficiency targets by cell' },
  account: { title: 'Account', desc: 'Profile and password' },
  users: { title: 'Users', desc: 'Manage login accounts (admin only)' }
};

const INV_CATEGORIES = ['robot', 'camera', 'lighting', 'plc', 'gripper', 'conveyor', 'lens', 'network', 'pc', 'other'];
const CELL_STATUSES = ['design', 'in_build', 'commissioning', 'production', 'archived'];
const SW_CATEGORIES = ['vision', 'robot', 'plc', 'hmi', 'runtime', 'other'];
const KPI_CATEGORIES = ['throughput', 'quality', 'efficiency', 'general'];

function canWrite() {
  return state.user && (state.user.role === 'admin' || state.user.role === 'engineer');
}

function isAdmin() {
  return state.user && state.user.role === 'admin';
}

function formData(form) {
  const data = {};
  new FormData(form).forEach((v, k) => {
    data[k] = v;
  });
  return data;
}

// ── Bootstrap ─────────────────────────────────────────────────────
async function init() {
  try {
    const { user } = await API.me();
    showApp(user);
  } catch (ex) {
    showLogin();
    if (ex && ex.status === 0) {
      const err = document.getElementById('login-error');
      if (err) {
        err.textContent = ex.message;
        err.classList.remove('hidden');
      }
    }
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp(user) {
  state.user = user;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('user-name').textContent = user.displayName;
  document.getElementById('user-role').textContent = user.role;
  document.getElementById('user-avatar').textContent = (user.displayName || user.username).charAt(0).toUpperCase();
  document.getElementById('nav-users').classList.toggle('hidden', !isAdmin());
  navigate(state.view || 'dashboard');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  err.classList.add('hidden');
  btn.disabled = true;
  try {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const { user } = await API.login(username, password);
    showApp(user);
  } catch (ex) {
    err.textContent = ex.message || 'Login failed';
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await API.logout();
  } catch {
    /* ignore */
  }
  state.user = null;
  showLogin();
});

document.getElementById('main-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  navigate(btn.dataset.view);
});

function navigate(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const meta = VIEW_META[view] || { title: view, desc: '' };
  document.getElementById('view-title').textContent = meta.title;
  document.getElementById('view-desc').textContent = meta.desc;
  document.getElementById('topbar-actions').innerHTML = '';
  const content = document.getElementById('content');
  content.innerHTML = '<div class="empty-state">Loading…</div>';
  const renderers = {
    dashboard: renderDashboard,
    cells: renderCells,
    inventory: renderInventory,
    network: renderNetwork,
    software: renderSoftware,
    kpis: renderKpis,
    account: renderAccount,
    users: renderUsers
  };
  (renderers[view] || (() => {
    content.innerHTML = '<div class="empty-state">Unknown view</div>';
  }))();
}

// ── Dashboard ─────────────────────────────────────────────────────
async function renderDashboard() {
  const content = document.getElementById('content');
  try {
    const data = await API.dashboard();
    const c = data.counts;
    content.innerHTML = `
      <div class="grid-stats">
        <div class="stat-card"><div class="label">Work Cells</div><div class="value">${c.cells}</div></div>
        <div class="stat-card"><div class="label">Inventory SKUs</div><div class="value">${c.inventory}</div></div>
        <div class="stat-card"><div class="label">Network Configs</div><div class="value">${c.networkConfigs}</div></div>
        <div class="stat-card"><div class="label">Software Pkgs</div><div class="value">${c.softwarePackages}</div></div>
        <div class="stat-card"><div class="label">KPI Targets</div><div class="value">${c.kpis}</div>
          <div class="hint">${data.kpiSummary.onTarget} on target · ${data.kpiSummary.offTarget} off</div></div>
        <div class="stat-card"><div class="label">Low Stock</div><div class="value">${data.lowStock.length}</div>
          <div class="hint">Qty under 3</div></div>
      </div>
      <div class="two-col">
        <div class="panel">
          <div class="panel-header"><h3>Cells by status</h3></div>
          <div class="panel-body">
            ${Object.keys(data.cellsByStatus).length
              ? `<table class="data"><tbody>
                  ${Object.entries(data.cellsByStatus)
                    .map(
                      ([s, n]) =>
                        `<tr><td>${UI.statusBadge(s)}</td><td style="text-align:right;font-weight:700">${n}</td></tr>`
                    )
                    .join('')}
                </tbody></table>`
              : '<p class="empty-state">No cells yet</p>'}
          </div>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Inventory by category</h3></div>
          <div class="panel-body">
            <table class="data"><tbody>
              ${Object.entries(data.inventoryByCategory)
                .map(([s, n]) => `<tr><td class="mono">${UI.escape(s)}</td><td style="text-align:right;font-weight:700">${n}</td></tr>`)
                .join('')}
            </tbody></table>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-header"><h3>Recent work cells</h3>
          <button type="button" class="btn btn-secondary btn-sm" data-go="cells">View all</button>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Name</th><th>Status</th><th>Customer</th><th>Location</th><th>Updated</th></tr></thead>
            <tbody>
              ${data.recentCells
                .map(
                  (cell) => `<tr>
                    <td><strong>${UI.escape(cell.name)}</strong></td>
                    <td>${UI.statusBadge(cell.status)}</td>
                    <td>${UI.escape(cell.customer || '—')}</td>
                    <td>${UI.escape(cell.location || '—')}</td>
                    <td class="mono">${UI.escape(cell.updatedAt?.slice(0, 10) || '')}</td>
                  </tr>`
                )
                .join('') || '<tr><td colspan="5" class="empty-state">No cells</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      ${
        data.lowStock.length
          ? `<div class="panel" style="margin-top:16px">
              <div class="panel-header"><h3>Low stock alerts</h3></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Part</th><th>PN</th><th>Qty</th><th>Vendor</th></tr></thead>
                  <tbody>
                    ${data.lowStock
                      .map(
                        (i) => `<tr>
                          <td>${UI.escape(i.name)}</td>
                          <td class="mono">${UI.escape(i.partNumber)}</td>
                          <td>${i.quantityOnHand}</td>
                          <td>${UI.escape(i.vendor)}</td>
                        </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>`
          : ''
      }
    `;
    content.querySelector('[data-go="cells"]')?.addEventListener('click', () => navigate('cells'));
  } catch (ex) {
    content.innerHTML = `<div class="empty-state"><strong>Failed to load</strong>${UI.escape(ex.message)}</div>`;
  }
}

// ── Inventory ─────────────────────────────────────────────────────
async function renderInventory() {
  const content = document.getElementById('content');
  const actions = document.getElementById('topbar-actions');
  if (canWrite()) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-add-inv">+ Add item</button>`;
    actions.querySelector('#btn-add-inv').onclick = () => openInventoryModal();
  }

  content.innerHTML = `
    <div class="toolbar">
      <input type="search" id="inv-search" placeholder="Search name, PN, vendor…" />
      <select id="inv-cat">
        <option value="">All categories</option>
        ${INV_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
      </select>
    </div>
    <div class="panel"><div class="table-wrap" id="inv-table"></div></div>
  `;

  const load = async () => {
    const q = document.getElementById('inv-search').value.trim();
    const category = document.getElementById('inv-cat').value;
    try {
      const { items } = await API.inventory({ q, category });
      state.cache.inventory = items;
      const el = document.getElementById('inv-table');
      if (!items.length) {
        el.innerHTML = '<div class="empty-state"><strong>No items</strong>Adjust filters or add inventory.</div>';
        return;
      }
      el.innerHTML = `
        <table class="data">
          <thead>
            <tr>
              <th>Name</th><th>Category</th><th>Part #</th><th>Vendor</th>
              <th>Qty</th><th>Unit cost</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (i) => `<tr class="clickable-row" data-view="${i.id}" title="View full details" tabindex="0">
                  <td><strong class="row-link">${UI.escape(i.name)}</strong>
                    <div class="mono" style="color:var(--text-dim);font-size:0.72rem;margin-top:2px">${UI.escape(
                      Object.entries(i.specs || {})
                        .map(([k, v]) => `${formatSpecLabel(k)}: ${v}`)
                        .slice(0, 3)
                        .join(' · ')
                    )}</div>
                  </td>
                  <td><span class="badge badge-neutral">${UI.escape(i.category)}</span></td>
                  <td class="mono">${UI.escape(i.partNumber)}</td>
                  <td>${UI.escape(i.vendor)}</td>
                  <td>${i.quantityOnHand}</td>
                  <td>${UI.money(i.unitCost)}</td>
                  <td>${UI.statusBadge(i.status)}</td>
                  <td class="actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-view-btn="${i.id}">Details</button>
                    ${canWrite() ? `<button type="button" class="btn btn-secondary btn-sm" data-edit="${i.id}">Edit</button>` : ''}
                    ${isAdmin() ? `<button type="button" class="btn btn-danger btn-sm" data-del="${i.id}">Delete</button>` : ''}
                  </td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

      const openById = (id) => {
        const item = items.find((x) => x.id === id);
        if (item) openInventoryDetail(item);
      };

      el.querySelectorAll('[data-view]').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          openById(row.dataset.view);
        });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openById(row.dataset.view);
          }
        });
      });
      el.querySelectorAll('[data-view-btn]').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          openById(b.dataset.viewBtn);
        };
      });
      el.querySelectorAll('[data-edit]').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          openInventoryModal(items.find((x) => x.id === b.dataset.edit));
        };
      });
      el.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async (e) => {
          e.stopPropagation();
          if (!UI.confirm('Delete this inventory item?')) return;
          try {
            await API.deleteInventory(b.dataset.del);
            UI.toast('Item deleted', 'success');
            load();
          } catch (ex) {
            UI.toast(ex.message, 'error');
          }
        };
      });
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };

  document.getElementById('inv-search').addEventListener('input', () => {
    clearTimeout(load._t);
    load._t = setTimeout(load, 200);
  });
  document.getElementById('inv-cat').addEventListener('change', load);
  await load();
}

function formatSpecLabel(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bMm\b/g, 'mm')
    .replace(/\bCm2\b/g, 'cm²')
    .replace(/\bKg\b/g, 'kg')
    .replace(/\bGb\b/g, 'GB')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bIp\b/g, 'IP')
    .replace(/\bOs\b/g, 'OS')
    .replace(/\bCpu\b/g, 'CPU')
    .replace(/\bGpu\b/g, 'GPU')
    .replace(/\bVac\b/g, 'VAC')
    .replace(/\bDc\b/g, 'DC');
}

function formatSpecValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return UI.escape(JSON.stringify(value, null, 2));
  return UI.escape(String(value));
}

function openInventoryDetail(item) {
  const specs = item.specs && typeof item.specs === 'object' ? item.specs : {};
  const specEntries = Object.entries(specs);
  const created = item.createdAt ? String(item.createdAt).replace('T', ' ').replace('Z', ' UTC') : '—';
  const updated = item.updatedAt ? String(item.updatedAt).replace('T', ' ').replace('Z', ' UTC') : '—';

  const specsHtml = specEntries.length
    ? `<div class="detail-spec-grid">
        ${specEntries
          .map(
            ([k, v]) => `
          <div class="detail-spec-item">
            <div class="detail-spec-label">${UI.escape(formatSpecLabel(k))}</div>
            <div class="detail-spec-value">${formatSpecValue(v)}</div>
          </div>`
          )
          .join('')}
      </div>`
    : `<div class="detail-empty">No manufacturer specifications recorded for this item.</div>`;

  UI.openModal({
    title: item.name || 'Inventory item',
    wide: true,
    bodyHtml: `
      <div class="inv-detail">
        <div class="inv-detail-hero">
          <div class="inv-detail-hero-main">
            <div class="inv-detail-kicker">
              <span class="badge badge-neutral">${UI.escape(item.category || '—')}</span>
              ${UI.statusBadge(item.status)}
            </div>
            <h3 class="inv-detail-title">${UI.escape(item.name || '—')}</h3>
            <p class="inv-detail-sub">
              <span class="mono">${UI.escape(item.partNumber || '—')}</span>
              <span class="dot">·</span>
              <span>${UI.escape(item.vendor || '—')}</span>
            </p>
          </div>
          <div class="inv-detail-metrics">
            <div class="inv-metric">
              <div class="inv-metric-label">Qty on hand</div>
              <div class="inv-metric-value">${item.quantityOnHand ?? 0}</div>
            </div>
            <div class="inv-metric">
              <div class="inv-metric-label">Unit cost</div>
              <div class="inv-metric-value">${UI.money(item.unitCost)}</div>
            </div>
            <div class="inv-metric">
              <div class="inv-metric-label">Extended</div>
              <div class="inv-metric-value">${UI.money((Number(item.unitCost) || 0) * (Number(item.quantityOnHand) || 0))}</div>
            </div>
          </div>
        </div>

        <section class="inv-detail-section">
          <h4>Catalog details</h4>
          <div class="detail-kv-grid">
            <div class="detail-kv"><span>Part number</span><strong class="mono">${UI.escape(item.partNumber || '—')}</strong></div>
            <div class="detail-kv"><span>Vendor</span><strong>${UI.escape(item.vendor || '—')}</strong></div>
            <div class="detail-kv"><span>Category</span><strong>${UI.escape(item.category || '—')}</strong></div>
            <div class="detail-kv"><span>Status</span><strong>${UI.escape(String(item.status || '—').replace(/_/g, ' '))}</strong></div>
            <div class="detail-kv"><span>Created</span><strong class="mono">${UI.escape(created)}</strong></div>
            <div class="detail-kv"><span>Updated</span><strong class="mono">${UI.escape(updated)}</strong></div>
          </div>
        </section>

        <section class="inv-detail-section">
          <h4>Manufacturer specifications</h4>
          ${specsHtml}
        </section>
      </div>`,
    footerHtml: `
      ${canWrite() ? `<button type="button" class="btn btn-secondary" id="detail-edit">Edit</button>` : ''}
      <button type="button" class="btn btn-primary" id="detail-close">Close</button>`
  });

  document.getElementById('detail-close').onclick = () => UI.closeModal();
  const editBtn = document.getElementById('detail-edit');
  if (editBtn) {
    editBtn.onclick = () => {
      UI.closeModal();
      openInventoryModal(item);
    };
  }
}

function openInventoryModal(item = null) {
  const specsStr = item?.specs ? JSON.stringify(item.specs, null, 0) : '{}';
  UI.openModal({
    title: item ? 'Edit inventory item' : 'Add inventory item',
    bodyHtml: `
      <form id="inv-form" class="form-grid">
        ${UI.field('name', 'Name', item?.name || '', 'text', 'required')}
        ${UI.field(
          'category',
          'Category',
          INV_CATEGORIES.map((c) => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join(
            ''
          ),
          'select',
          'required'
        )}
        ${UI.field('partNumber', 'Part number', item?.partNumber || '', 'text', 'required')}
        ${UI.field('vendor', 'Vendor', item?.vendor || '', 'text', 'required')}
        ${UI.field('quantityOnHand', 'Quantity on hand', item?.quantityOnHand ?? 0, 'number', 'min="0"')}
        ${UI.field('unitCost', 'Unit cost (USD)', item?.unitCost ?? 0, 'number', 'min="0" step="0.01"')}
        ${UI.field(
          'status',
          'Status',
          ['available', 'reserved', 'out_of_stock']
            .map((s) => `<option value="${s}" ${item?.status === s ? 'selected' : ''}>${s}</option>`)
            .join(''),
          'select'
        )}
        ${UI.field('specs', 'Specs (JSON object)', specsStr, 'textarea', 'class="full" rows="3"')}
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Save</button>`
  });
  document.getElementById('modal-cancel').onclick = () => UI.closeModal();
  document.getElementById('modal-save').onclick = async () => {
    const form = document.getElementById('inv-form');
    const data = formData(form);
    let specs = {};
    try {
      specs = data.specs ? JSON.parse(data.specs) : {};
    } catch {
      UI.toast('Specs must be valid JSON', 'error');
      return;
    }
    const payload = {
      name: data.name,
      category: data.category,
      partNumber: data.partNumber,
      vendor: data.vendor,
      quantityOnHand: Number(data.quantityOnHand),
      unitCost: Number(data.unitCost),
      status: data.status,
      specs
    };
    try {
      if (item) await API.updateInventory(item.id, payload);
      else await API.createInventory(payload);
      UI.closeModal();
      UI.toast(item ? 'Item updated' : 'Item created', 'success');
      renderInventory();
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };
}

// ── Network ───────────────────────────────────────────────────────
async function renderNetwork() {
  const content = document.getElementById('content');
  const actions = document.getElementById('topbar-actions');
  if (canWrite()) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-add-net">+ New config</button>`;
    actions.querySelector('#btn-add-net').onclick = () => openNetworkModal();
  }

  try {
    const { configs } = await API.network();
    state.cache.network = configs;
    if (!configs.length) {
      content.innerHTML = '<div class="empty-state"><strong>No network configs</strong>Create a unique IP scheme for a cell.</div>';
      return;
    }
    content.innerHTML = configs
      .map(
        (cfg) => `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-header">
          <div>
            <h3>${UI.escape(cfg.name)}</h3>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">${UI.escape(cfg.description || '')}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="badge badge-info">VLAN ${UI.escape(String(cfg.vlanId))}</span>
            ${canWrite() ? `<button type="button" class="btn btn-secondary btn-sm" data-edit="${cfg.id}">Edit</button>` : ''}
            ${isAdmin() ? `<button type="button" class="btn btn-danger btn-sm" data-del="${cfg.id}">Delete</button>` : ''}
          </div>
        </div>
        <div class="panel-body">
          <div class="meta-row" style="margin-bottom:12px">
            <span><strong>Subnet</strong> <span class="mono">${UI.escape(cfg.subnet)}</span></span>
            <span><strong>Gateway</strong> <span class="mono">${UI.escape(cfg.gateway)}</span></span>
            <span><strong>DNS</strong> <span class="mono">${UI.escape((cfg.dns || []).join(', ') || '—')}</span></span>
          </div>
          <div class="table-wrap">
            <table class="data network-table">
              <thead><tr><th>Role</th><th>Hostname</th><th>IP</th><th>MAC</th><th>Ports</th></tr></thead>
              <tbody>
                ${(cfg.components || [])
                  .map(
                    (c) => `<tr>
                      <td>${UI.escape(c.role)}</td>
                      <td class="mono">${UI.escape(c.hostname)}</td>
                      <td class="mono">${UI.escape(c.ip)}</td>
                      <td class="mono">${UI.escape(c.mac || '—')}</td>
                      <td class="mono">${UI.escape((c.ports || []).join(', '))}</td>
                    </tr>`
                  )
                  .join('') || '<tr><td colspan="5">No components</td></tr>'}
              </tbody>
            </table>
          </div>
          ${cfg.notes ? `<p style="margin:12px 0 0;font-size:0.85rem;color:var(--text-muted)">${UI.escape(cfg.notes)}</p>` : ''}
        </div>
      </div>`
      )
      .join('');

    content.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => openNetworkModal(configs.find((c) => c.id === b.dataset.edit));
    });
    content.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!UI.confirm('Delete this network configuration?')) return;
        try {
          await API.deleteNetwork(b.dataset.del);
          UI.toast('Deleted', 'success');
          renderNetwork();
        } catch (ex) {
          UI.toast(ex.message, 'error');
        }
      };
    });
  } catch (ex) {
    content.innerHTML = `<div class="empty-state">${UI.escape(ex.message)}</div>`;
  }
}

function componentRowsHtml(components = []) {
  const rows =
    components.length > 0
      ? components
      : [{ role: '', hostname: '', ip: '', mac: '', ports: [] }];
  return rows
    .map(
      (c, i) => `
    <div class="component-row" data-idx="${i}">
      <input name="role" placeholder="role" value="${UI.escape(c.role || '')}" />
      <input name="hostname" placeholder="hostname" value="${UI.escape(c.hostname || '')}" />
      <input name="ip" placeholder="IP" value="${UI.escape(c.ip || '')}" />
      <input name="mac" placeholder="MAC" value="${UI.escape(c.mac || '')}" />
      <button type="button" class="btn btn-ghost btn-sm remove-comp" title="Remove">×</button>
      <input name="ports" placeholder="ports (comma)" value="${UI.escape((c.ports || []).join(', '))}" style="grid-column:1/-2" />
    </div>`
    )
    .join('');
}

function openNetworkModal(cfg = null) {
  UI.openModal({
    title: cfg ? 'Edit network config' : 'New network config',
    wide: true,
    bodyHtml: `
      <form id="net-form" class="form-stack">
        <div class="form-grid">
          ${UI.field('name', 'Name', cfg?.name || '', 'text', 'required')}
          ${UI.field('vlanId', 'VLAN ID', cfg?.vlanId ?? '', 'number')}
          ${UI.field('subnet', 'Subnet (CIDR)', cfg?.subnet || '', 'text', 'required placeholder="192.168.10.0/24"')}
          ${UI.field('gateway', 'Gateway', cfg?.gateway || '', 'text', 'required')}
          ${UI.field('dns', 'DNS (comma-separated)', (cfg?.dns || []).join(', '), 'text', 'class="full"')}
          ${UI.field('description', 'Description', cfg?.description || '', 'textarea', 'class="full"')}
          ${UI.field('notes', 'Notes', cfg?.notes || '', 'textarea', 'class="full"')}
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:0.85rem">Component endpoints</strong>
            <button type="button" class="btn btn-secondary btn-sm" id="add-comp">+ Row</button>
          </div>
          <div class="component-rows" id="comp-rows">${componentRowsHtml(cfg?.components)}</div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Save</button>`
  });

  const rowsEl = document.getElementById('comp-rows');
  document.getElementById('add-comp').onclick = () => {
    rowsEl.insertAdjacentHTML('beforeend', componentRowsHtml([{}]));
  };
  rowsEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-comp')) {
      e.target.closest('.component-row')?.remove();
    }
  });
  document.getElementById('modal-cancel').onclick = () => UI.closeModal();
  document.getElementById('modal-save').onclick = async () => {
    const form = document.getElementById('net-form');
    const data = formData(form);
    const components = [...rowsEl.querySelectorAll('.component-row')]
      .map((row) => {
        const role = row.querySelector('[name=role]')?.value.trim();
        const hostname = row.querySelector('[name=hostname]')?.value.trim();
        const ip = row.querySelector('[name=ip]')?.value.trim();
        const mac = row.querySelector('[name=mac]')?.value.trim();
        const portsRaw = row.querySelector('[name=ports]')?.value || '';
        const ports = portsRaw
          .split(',')
          .map((p) => Number(p.trim()))
          .filter((n) => !Number.isNaN(n) && n > 0);
        if (!role && !hostname && !ip) return null;
        return { role, hostname, ip, mac, ports };
      })
      .filter(Boolean);

    const payload = {
      name: data.name,
      vlanId: Number(data.vlanId) || 0,
      subnet: data.subnet,
      gateway: data.gateway,
      dns: data.dns
        ? data.dns
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      description: data.description,
      notes: data.notes,
      components
    };
    try {
      if (cfg) await API.updateNetwork(cfg.id, payload);
      else await API.createNetwork(payload);
      UI.closeModal();
      UI.toast('Network config saved', 'success');
      renderNetwork();
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };
}

// ── Software ──────────────────────────────────────────────────────
async function renderSoftware() {
  const content = document.getElementById('content');
  const actions = document.getElementById('topbar-actions');
  if (canWrite()) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-add-sw">+ Add package</button>`;
    actions.querySelector('#btn-add-sw').onclick = () => openSoftwareModal();
  }

  content.innerHTML = `
    <div class="toolbar">
      <input type="search" id="sw-search" placeholder="Search name, vendor, version…" />
      <select id="sw-cat">
        <option value="">All categories</option>
        ${SW_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
      </select>
    </div>
    <div class="panel"><div class="table-wrap" id="sw-table"></div></div>
  `;

  const load = async () => {
    const q = document.getElementById('sw-search').value.trim();
    const category = document.getElementById('sw-cat').value;
    try {
      const { packages } = await API.software({ q, category });
      state.cache.software = packages;
      const el = document.getElementById('sw-table');
      if (!packages.length) {
        el.innerHTML = '<div class="empty-state"><strong>No packages</strong></div>';
        return;
      }
      el.innerHTML = `
        <table class="data">
          <thead>
            <tr><th>Package</th><th>Version</th><th>Category</th><th>Vendor</th><th>License</th><th>Compatible HW</th><th></th></tr>
          </thead>
          <tbody>
            ${packages
              .map(
                (p) => `<tr>
                  <td><strong>${UI.escape(p.name)}</strong>
                    <div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px" class="mono">${UI.escape(p.installPath || '')}</div>
                  </td>
                  <td class="mono">${UI.escape(p.version)}</td>
                  <td><span class="badge badge-info">${UI.escape(p.category)}</span></td>
                  <td>${UI.escape(p.vendor)}</td>
                  <td>${UI.escape(p.licenseType || '—')}</td>
                  <td style="max-width:180px;font-size:0.8rem">${UI.escape((p.compatibleHardware || []).join(', ') || '—')}</td>
                  <td class="actions">
                    ${canWrite() ? `<button type="button" class="btn btn-secondary btn-sm" data-edit="${p.id}">Edit</button>` : ''}
                    ${isAdmin() ? `<button type="button" class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button>` : ''}
                  </td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
      el.querySelectorAll('[data-edit]').forEach((b) => {
        b.onclick = () => openSoftwareModal(packages.find((x) => x.id === b.dataset.edit));
      });
      el.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          if (!UI.confirm('Delete this package?')) return;
          try {
            await API.deleteSoftware(b.dataset.del);
            UI.toast('Deleted', 'success');
            load();
          } catch (ex) {
            UI.toast(ex.message, 'error');
          }
        };
      });
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };

  document.getElementById('sw-search').addEventListener('input', () => {
    clearTimeout(load._t);
    load._t = setTimeout(load, 200);
  });
  document.getElementById('sw-cat').addEventListener('change', load);
  await load();
}

function openSoftwareModal(pkg = null) {
  UI.openModal({
    title: pkg ? 'Edit software package' : 'Add software package',
    bodyHtml: `
      <form id="sw-form" class="form-grid">
        ${UI.field('name', 'Name', pkg?.name || '', 'text', 'required')}
        ${UI.field('version', 'Version', pkg?.version || '', 'text', 'required')}
        ${UI.field(
          'category',
          'Category',
          SW_CATEGORIES.map((c) => `<option value="${c}" ${pkg?.category === c ? 'selected' : ''}>${c}</option>`).join(
            ''
          ),
          'select',
          'required'
        )}
        ${UI.field('vendor', 'Vendor', pkg?.vendor || '', 'text', 'required')}
        ${UI.field('licenseType', 'License type', pkg?.licenseType || '', 'text')}
        ${UI.field('installPath', 'Install path', pkg?.installPath || '', 'text')}
        ${UI.field(
          'compatibleHardware',
          'Compatible hardware (comma-separated)',
          (pkg?.compatibleHardware || []).join(', '),
          'text',
          'class="full"'
        )}
        ${UI.field('notes', 'Notes', pkg?.notes || '', 'textarea', 'class="full"')}
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Save</button>`
  });
  document.getElementById('modal-cancel').onclick = () => UI.closeModal();
  document.getElementById('modal-save').onclick = async () => {
    const data = formData(document.getElementById('sw-form'));
    const payload = {
      name: data.name,
      version: data.version,
      category: data.category,
      vendor: data.vendor,
      licenseType: data.licenseType,
      installPath: data.installPath,
      notes: data.notes,
      compatibleHardware: data.compatibleHardware
        ? data.compatibleHardware
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    };
    try {
      if (pkg) await API.updateSoftware(pkg.id, payload);
      else await API.createSoftware(payload);
      UI.closeModal();
      UI.toast('Package saved', 'success');
      renderSoftware();
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };
}

// ── Work cells ────────────────────────────────────────────────────
async function renderCells() {
  const content = document.getElementById('content');
  const actions = document.getElementById('topbar-actions');
  if (canWrite()) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-add-cell">+ New cell</button>`;
    actions.querySelector('#btn-add-cell').onclick = () => openCellModal();
  }

  try {
    const { cells } = await API.cells();
    state.cache.cells = cells;
    if (!cells.length) {
      content.innerHTML =
        '<div class="empty-state"><strong>No work cells yet</strong>Create a cell and attach inventory, network, and software.</div>';
      return;
    }
    content.innerHTML = `<div class="cell-grid">
      ${cells
        .map((cell) => {
          const bomCount = (cell.inventoryItems || []).length;
          const kpiTotal = (cell.kpis || []).length;
          return `
          <article class="cell-card">
            <div class="cell-card-top">
              <div>
                <h3>${UI.escape(cell.name)}</h3>
                <p>${UI.escape(cell.description || 'No description')}</p>
              </div>
              ${UI.statusBadge(cell.status)}
            </div>
            <div class="meta-row">
              <span><strong>Customer</strong> ${UI.escape(cell.customer || '—')}</span>
              <span><strong>Location</strong> ${UI.escape(cell.location || '—')}</span>
              <span><strong>BOM lines</strong> ${bomCount}</span>
              <span><strong>KPIs</strong> ${kpiTotal}</span>
            </div>
            <div class="chip-list">
              ${cell.network ? `<span class="chip">Net: ${UI.escape(cell.network.name)}</span>` : '<span class="chip">No network</span>'}
              ${(cell.software || [])
                .slice(0, 3)
                .map((s) => `<span class="chip">${UI.escape(s.name)} ${UI.escape(s.version)}</span>`)
                .join('')}
            </div>
            <div class="cell-card-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-view="${cell.id}">Details</button>
              ${canWrite() ? `<button type="button" class="btn btn-secondary btn-sm" data-edit="${cell.id}">Edit</button>` : ''}
              ${isAdmin() ? `<button type="button" class="btn btn-danger btn-sm" data-del="${cell.id}">Delete</button>` : ''}
            </div>
          </article>`;
        })
        .join('')}
    </div>`;

    content.querySelectorAll('[data-view]').forEach((b) => {
      b.onclick = () => showCellDetail(b.dataset.view);
    });
    content.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => openCellModal(cells.find((c) => c.id === b.dataset.edit));
    });
    content.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!UI.confirm('Delete this work cell and its KPIs?')) return;
        try {
          await API.deleteCell(b.dataset.del);
          UI.toast('Cell deleted', 'success');
          renderCells();
        } catch (ex) {
          UI.toast(ex.message, 'error');
        }
      };
    });
  } catch (ex) {
    content.innerHTML = `<div class="empty-state">${UI.escape(ex.message)}</div>`;
  }
}

async function showCellDetail(id) {
  const content = document.getElementById('content');
  document.getElementById('topbar-actions').innerHTML =
    `<button type="button" class="btn btn-secondary" id="back-cells">← Back</button>`;
  document.getElementById('back-cells').onclick = () => navigate('cells');
  document.getElementById('view-title').textContent = 'Cell detail';
  content.innerHTML = '<div class="empty-state">Loading…</div>';

  try {
    const { cell, kpis } = await API.cell(id);
    document.getElementById('view-title').textContent = cell.name;
    document.getElementById('view-desc').textContent = cell.description || '';

    const bomRows = (cell.inventoryDetails || [])
      .map((row) => {
        const i = row.item;
        if (!i) return `<tr><td colspan="5">Missing item ${UI.escape(row.inventoryId)}</td></tr>`;
        return `<tr>
          <td>${UI.escape(i.name)}</td>
          <td class="mono">${UI.escape(i.partNumber)}</td>
          <td>${UI.escape(i.category)}</td>
          <td>${row.qty}</td>
          <td>${UI.money((i.unitCost || 0) * row.qty)}</td>
        </tr>`;
      })
      .join('');

    const bomTotal = (cell.inventoryDetails || []).reduce((sum, row) => {
      return sum + (row.item?.unitCost || 0) * (row.qty || 0);
    }, 0);

    content.innerHTML = `
      <div class="meta-row" style="margin-bottom:16px">
        ${UI.statusBadge(cell.status)}
        <span><strong>Customer</strong> ${UI.escape(cell.customer || '—')}</span>
        <span><strong>Location</strong> ${UI.escape(cell.location || '—')}</span>
        <span><strong>Owner</strong> ${UI.escape(cell.owner || '—')}</span>
      </div>
      <div class="two-col">
        <div class="panel">
          <div class="panel-header"><h3>Bill of materials</h3><span class="mono">${UI.money(bomTotal)}</span></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Item</th><th>PN</th><th>Cat</th><th>Qty</th><th>Ext.</th></tr></thead>
              <tbody>${bomRows || '<tr><td colspan="5">Empty BOM</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="panel detail-section">
            <div class="panel-header"><h3>Network</h3></div>
            <div class="panel-body">
              ${
                cell.network
                  ? `<strong>${UI.escape(cell.network.name)}</strong>
                     <div class="meta-row" style="margin-top:8px">
                       <span class="mono">${UI.escape(cell.network.subnet)}</span>
                       <span>VLAN ${cell.network.vlanId}</span>
                       <span>${(cell.network.components || []).length} endpoints</span>
                     </div>`
                  : '<span class="text-muted">No network assigned</span>'
              }
            </div>
          </div>
          <div class="panel">
            <div class="panel-header"><h3>Software stack</h3></div>
            <div class="panel-body">
              <div class="chip-list">
                ${(cell.software || [])
                  .map((s) => `<span class="chip">${UI.escape(s.name)} <span class="mono">${UI.escape(s.version)}</span></span>`)
                  .join('') || '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-header"><h3>KPI goals</h3></div>
        <div class="panel-body">
          <div class="kpi-grid">
            ${(kpis || [])
              .map((k) => {
                const on = isKpiOnTarget(k);
                const { pct, barClass } = UI.kpiProgress({ ...k, onTarget: on });
                return `
                <div class="kpi-card">
                  <div class="header-row">
                    <div>
                      <h4>${UI.escape(k.name)}</h4>
                      <div class="cell-ref">${UI.escape(k.category)} · ${UI.escape(k.direction.replace(/_/g, ' '))}</div>
                    </div>
                    <span class="badge ${on ? 'badge-success' : 'badge-warning'}">${on ? 'On target' : 'Off target'}</span>
                  </div>
                  <div class="kpi-values">
                    <span class="current">${k.current} <small style="font-weight:400;color:var(--text-muted)">${UI.escape(k.unit)}</small></span>
                    <span class="target">Target ${k.target} ${UI.escape(k.unit)}</span>
                  </div>
                  <div class="progress"><div class="progress-bar ${barClass}" style="width:${pct}%"></div></div>
                </div>`;
              })
              .join('') || '<div class="empty-state">No KPIs for this cell</div>'}
          </div>
        </div>
      </div>`;
  } catch (ex) {
    content.innerHTML = `<div class="empty-state">${UI.escape(ex.message)}</div>`;
  }
}

function isKpiOnTarget(k) {
  if (k.direction === 'lower_is_better') return k.current > 0 && k.current <= k.target;
  return k.current >= k.target;
}

async function openCellModal(cell = null) {
  let inventory = state.cache.inventory;
  let network = state.cache.network;
  let software = state.cache.software;
  try {
    if (!inventory) inventory = (await API.inventory()).items;
    if (!network) network = (await API.network()).configs;
    if (!software) software = (await API.software()).packages;
  } catch (ex) {
    UI.toast(ex.message, 'error');
    return;
  }

  const selectedInv = new Map((cell?.inventoryItems || []).map((r) => [r.inventoryId, r.qty]));
  const selectedSw = new Set(cell?.softwarePackageIds || []);

  UI.openModal({
    title: cell ? 'Edit work cell' : 'New work cell',
    wide: true,
    bodyHtml: `
      <form id="cell-form" class="form-stack">
        <div class="form-grid">
          ${UI.field('name', 'Cell name', cell?.name || '', 'text', 'required')}
          ${UI.field(
            'status',
            'Status',
            CELL_STATUSES.map((s) => `<option value="${s}" ${cell?.status === s ? 'selected' : ''}>${s}</option>`).join(
              ''
            ),
            'select'
          )}
          ${UI.field('customer', 'Customer / line', cell?.customer || '', 'text')}
          ${UI.field('location', 'Location', cell?.location || '', 'text')}
          ${UI.field('description', 'Description', cell?.description || '', 'textarea', 'class="full"')}
          ${UI.field(
            'networkConfigId',
            'Network configuration',
            `<option value="">— None —</option>` +
              network
                .map(
                  (n) =>
                    `<option value="${n.id}" ${cell?.networkConfigId === n.id ? 'selected' : ''}>${UI.escape(n.name)} (${UI.escape(n.subnet)})</option>`
                )
                .join(''),
            'select',
            'class="full"'
          )}
        </div>
        <div>
          <strong style="font-size:0.85rem">Inventory (BOM)</strong>
          <div class="inventory-pick" id="bom-pick">
            ${inventory
              .map(
                (i) => `
              <label>
                <input type="checkbox" data-inv="${i.id}" ${selectedInv.has(i.id) ? 'checked' : ''} />
                <span>${UI.escape(i.name)} <span class="mono" style="color:var(--text-dim)">${UI.escape(i.partNumber)}</span></span>
                <input type="number" min="1" value="${selectedInv.get(i.id) || 1}" data-qty="${i.id}" />
              </label>`
              )
              .join('')}
          </div>
        </div>
        <div>
          <strong style="font-size:0.85rem">Software packages</strong>
          <div class="software-pick" id="sw-pick">
            ${software
              .map(
                (p) => `
              <label>
                <input type="checkbox" data-sw="${p.id}" ${selectedSw.has(p.id) ? 'checked' : ''} />
                ${UI.escape(p.name)} <span class="mono">${UI.escape(p.version)}</span>
              </label>`
              )
              .join('')}
          </div>
        </div>
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Save</button>`
  });

  document.getElementById('modal-cancel').onclick = () => UI.closeModal();
  document.getElementById('modal-save').onclick = async () => {
    const data = formData(document.getElementById('cell-form'));
    const inventoryItems = [...document.querySelectorAll('#bom-pick [data-inv]:checked')].map((cb) => {
      const id = cb.dataset.inv;
      const qtyInput = document.querySelector(`#bom-pick [data-qty="${id}"]`);
      return { inventoryId: id, qty: Number(qtyInput?.value) || 1 };
    });
    const softwarePackageIds = [...document.querySelectorAll('#sw-pick [data-sw]:checked')].map((cb) => cb.dataset.sw);
    const payload = {
      name: data.name,
      status: data.status,
      customer: data.customer,
      location: data.location,
      description: data.description,
      networkConfigId: data.networkConfigId || null,
      inventoryItems,
      softwarePackageIds
    };
    try {
      if (cell) await API.updateCell(cell.id, payload);
      else await API.createCell(payload);
      UI.closeModal();
      UI.toast('Work cell saved', 'success');
      renderCells();
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };
}

// ── KPIs ──────────────────────────────────────────────────────────
async function renderKpis() {
  const content = document.getElementById('content');
  const actions = document.getElementById('topbar-actions');
  if (canWrite()) {
    actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-add-kpi">+ Add KPI</button>`;
    actions.querySelector('#btn-add-kpi').onclick = () => openKpiModal();
  }

  content.innerHTML = `
    <div class="toolbar">
      <select id="kpi-cell-filter"><option value="">All cells</option></select>
    </div>
    <div class="kpi-grid" id="kpi-grid"></div>
  `;

  try {
    const [{ kpis }, { cells }] = await Promise.all([API.kpis(), API.cells()]);
    state.cache.cells = cells;
    const filter = document.getElementById('kpi-cell-filter');
    cells.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      filter.appendChild(opt);
    });

    const paint = (list) => {
      const grid = document.getElementById('kpi-grid');
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state"><strong>No KPIs</strong>Add targets for a work cell.</div>';
        return;
      }
      grid.innerHTML = list
        .map((k) => {
          const on = k.onTarget;
          const { pct, barClass } = UI.kpiProgress(k);
          return `
          <div class="kpi-card">
            <div class="header-row">
              <div>
                <h4>${UI.escape(k.name)}</h4>
                <div class="cell-ref">${UI.escape(k.cellName)} · ${UI.escape(k.category)}</div>
              </div>
              <span class="badge ${on ? 'badge-success' : 'badge-warning'}">${on ? 'On target' : 'Off target'}</span>
            </div>
            <div class="kpi-values">
              <span class="current">${k.current} <small style="font-weight:400;color:var(--text-muted)">${UI.escape(k.unit)}</small></span>
              <span class="target">Target ${k.target}</span>
            </div>
            <div class="progress"><div class="progress-bar ${barClass}" style="width:${pct}%"></div></div>
            ${k.notes ? `<p style="margin:10px 0 0;font-size:0.8rem;color:var(--text-muted)">${UI.escape(k.notes)}</p>` : ''}
            ${
              canWrite()
                ? `<div style="margin-top:12px;display:flex;gap:6px">
                    <button type="button" class="btn btn-secondary btn-sm" data-edit="${k.id}">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm" data-del="${k.id}">Delete</button>
                  </div>`
                : ''
            }
          </div>`;
        })
        .join('');

      grid.querySelectorAll('[data-edit]').forEach((b) => {
        b.onclick = () => openKpiModal(list.find((x) => x.id === b.dataset.edit), cells);
      });
      grid.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          if (!UI.confirm('Delete this KPI?')) return;
          try {
            await API.deleteKpi(b.dataset.del);
            UI.toast('KPI deleted', 'success');
            renderKpis();
          } catch (ex) {
            UI.toast(ex.message, 'error');
          }
        };
      });
    };

    paint(kpis);
    filter.onchange = () => {
      const v = filter.value;
      paint(v ? kpis.filter((k) => k.cellId === v) : kpis);
    };
  } catch (ex) {
    content.innerHTML = `<div class="empty-state">${UI.escape(ex.message)}</div>`;
  }
}

async function openKpiModal(kpi = null, cellsList = null) {
  let cells = cellsList || state.cache.cells;
  if (!cells) {
    try {
      cells = (await API.cells()).cells;
    } catch (ex) {
      UI.toast(ex.message, 'error');
      return;
    }
  }

  UI.openModal({
    title: kpi ? 'Edit KPI' : 'Add KPI goal',
    bodyHtml: `
      <form id="kpi-form" class="form-grid">
        ${UI.field(
          'cellId',
          'Work cell',
          cells
            .map((c) => `<option value="${c.id}" ${kpi?.cellId === c.id ? 'selected' : ''}>${UI.escape(c.name)}</option>`)
            .join(''),
          'select',
          'required'
        )}
        ${UI.field('name', 'KPI name', kpi?.name || '', 'text', 'required')}
        ${UI.field('unit', 'Unit', kpi?.unit || '', 'text', 'placeholder="sec, %, ppm…"')}
        ${UI.field('target', 'Target', kpi?.target ?? '', 'number', 'required step="any"')}
        ${UI.field('current', 'Current value', kpi?.current ?? 0, 'number', 'step="any"')}
        ${UI.field(
          'direction',
          'Direction',
          [
            ['higher_is_better', 'Higher is better'],
            ['lower_is_better', 'Lower is better']
          ]
            .map(
              ([v, l]) =>
                `<option value="${v}" ${kpi?.direction === v ? 'selected' : ''}>${l}</option>`
            )
            .join(''),
          'select'
        )}
        ${UI.field(
          'category',
          'Category',
          KPI_CATEGORIES.map(
            (c) => `<option value="${c}" ${kpi?.category === c ? 'selected' : ''}>${c}</option>`
          ).join(''),
          'select'
        )}
        ${UI.field('notes', 'Notes', kpi?.notes || '', 'textarea', 'class="full"')}
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Save</button>`
  });
  document.getElementById('modal-cancel').onclick = () => UI.closeModal();
  document.getElementById('modal-save').onclick = async () => {
    const data = formData(document.getElementById('kpi-form'));
    const payload = {
      cellId: data.cellId,
      name: data.name,
      unit: data.unit,
      target: Number(data.target),
      current: Number(data.current),
      direction: data.direction,
      category: data.category,
      notes: data.notes
    };
    try {
      if (kpi) await API.updateKpi(kpi.id, payload);
      else await API.createKpi(payload);
      UI.closeModal();
      UI.toast('KPI saved', 'success');
      renderKpis();
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };
}

// ── Account ───────────────────────────────────────────────────────
function renderAccount() {
  const content = document.getElementById('content');
  const u = state.user;
  content.innerHTML = `
    <div class="two-col">
      <div class="panel">
        <div class="panel-header"><h3>Profile</h3></div>
        <div class="panel-body">
          <table class="data">
            <tbody>
              <tr><td>Display name</td><td><strong>${UI.escape(u.displayName)}</strong></td></tr>
              <tr><td>Username</td><td class="mono">${UI.escape(u.username)}</td></tr>
              <tr><td>Role</td><td>${UI.statusBadge(u.role)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h3>Change password</h3></div>
        <div class="panel-body">
          <form id="pw-form" class="form-stack">
            ${UI.field('currentPassword', 'Current password', '', 'password', 'required')}
            ${UI.field('newPassword', 'New password (min 6)', '', 'password', 'required minlength="6"')}
            ${UI.field('confirm', 'Confirm new password', '', 'password', 'required minlength="6"')}
            <button type="submit" class="btn btn-primary">Update password</button>
          </form>
        </div>
      </div>
    </div>`;

  document.getElementById('pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    if (data.newPassword !== data.confirm) {
      UI.toast('Passwords do not match', 'error');
      return;
    }
    try {
      await API.changePassword(data.currentPassword, data.newPassword);
      UI.toast('Password updated', 'success');
      e.target.reset();
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };
}

// ── Users (admin) ─────────────────────────────────────────────────
async function renderUsers() {
  if (!isAdmin()) {
    document.getElementById('content').innerHTML = '<div class="empty-state">Admin only</div>';
    return;
  }
  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = `<button type="button" class="btn btn-primary" id="btn-add-user">+ New user</button>`;
  actions.querySelector('#btn-add-user').onclick = () => openUserModal();

  const content = document.getElementById('content');
  try {
    const { users } = await API.getUsers();
    content.innerHTML = `
      <div class="panel">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Display name</th><th>Username</th><th>Role</th><th>Created</th></tr></thead>
            <tbody>
              ${users
                .map(
                  (u) => `<tr>
                    <td><strong>${UI.escape(u.displayName)}</strong></td>
                    <td class="mono">${UI.escape(u.username)}</td>
                    <td>${UI.statusBadge(u.role)}</td>
                    <td class="mono">${UI.escape(u.createdAt?.slice(0, 10) || '')}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      <p style="margin-top:12px;font-size:0.85rem;color:var(--text-muted)">
        Roles: <strong>admin</strong> full access · <strong>engineer</strong> create/edit · <strong>viewer</strong> read-only
      </p>`;
  } catch (ex) {
    content.innerHTML = `<div class="empty-state">${UI.escape(ex.message)}</div>`;
  }
}

function openUserModal() {
  UI.openModal({
    title: 'Create user',
    bodyHtml: `
      <form id="user-form" class="form-grid">
        ${UI.field('displayName', 'Display name', '', 'text', 'required')}
        ${UI.field('username', 'Username', '', 'text', 'required')}
        ${UI.field('password', 'Password', '', 'password', 'required minlength="6"')}
        ${UI.field(
          'role',
          'Role',
          ['admin', 'engineer', 'viewer'].map((r) => `<option value="${r}">${r}</option>`).join(''),
          'select'
        )}
      </form>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Create</button>`
  });
  document.getElementById('modal-cancel').onclick = () => UI.closeModal();
  document.getElementById('modal-save').onclick = async () => {
    const data = formData(document.getElementById('user-form'));
    try {
      await API.createUser(data);
      UI.closeModal();
      UI.toast('User created', 'success');
      renderUsers();
    } catch (ex) {
      UI.toast(ex.message, 'error');
    }
  };
}

// unused var cleanup for kpiOn in cells - leave as is, it's fine

init();
