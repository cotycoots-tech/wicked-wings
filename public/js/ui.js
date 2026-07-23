const UI = {
  toast(message, type = 'info') {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3200);
  },

  escape(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  money(n) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      Number(n) || 0
    );
  },

  statusBadge(status) {
    const map = {
      design: 'badge-neutral',
      in_build: 'badge-info',
      commissioning: 'badge-warning',
      production: 'badge-success',
      archived: 'badge-neutral',
      available: 'badge-success',
      out_of_stock: 'badge-danger',
      reserved: 'badge-warning'
    };
    const cls = map[status] || 'badge-neutral';
    const label = String(status || '').replace(/_/g, ' ');
    return `<span class="badge ${cls}">${UI.escape(label)}</span>`;
  },

  openModal({ title, bodyHtml, footerHtml, wide }) {
    const root = document.getElementById('modal-root');
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    modal.classList.toggle('wide', !!wide);
    root.classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal-root').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-footer').innerHTML = '';
  },

  confirm(message) {
    return window.confirm(message);
  },

  kpiProgress(kpi) {
    const target = Number(kpi.target) || 1;
    const current = Number(kpi.current) || 0;
    let pct;
    if (kpi.direction === 'lower_is_better') {
      if (current <= 0) pct = 0;
      else if (current <= target) pct = 100;
      else pct = Math.max(0, Math.min(100, (target / current) * 100));
    } else {
      pct = Math.max(0, Math.min(100, (current / target) * 100));
    }
    let barClass = 'warn';
    if (kpi.onTarget) barClass = 'ok';
    else if (pct < 50) barClass = 'bad';
    return { pct, barClass };
  },

  field(name, label, value = '', type = 'text', extra = '') {
    if (type === 'textarea') {
      return `<label class="field full"><span>${UI.escape(label)}</span><textarea name="${name}" ${extra}>${UI.escape(value)}</textarea></label>`;
    }
    if (type === 'select') {
      return `<label class="field"><span>${UI.escape(label)}</span><select name="${name}" ${extra}>${value}</select></label>`;
    }
    return `<label class="field"><span>${UI.escape(label)}</span><input type="${type}" name="${name}" value="${UI.escape(value)}" ${extra} /></label>`;
  }
};

document.getElementById('modal-close')?.addEventListener('click', () => UI.closeModal());
document.getElementById('modal-backdrop')?.addEventListener('click', () => UI.closeModal());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') UI.closeModal();
});
