const API = {
  async request(path, options = {}) {
    const opts = {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    };
    if (opts.body && typeof opts.body === 'object') {
      opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch {
      const err = new Error(
        'Cannot reach the server. Start it with: python3 server/app.py (http://localhost:3847)'
      );
      err.status = 0;
      throw err;
    }
    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || 'Empty response from server' };
      }
    }
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  me() {
    return this.request('/api/me');
  },
  login(username, password) {
    return this.request('/api/login', { method: 'POST', body: { username, password } });
  },
  logout() {
    return this.request('/api/logout', { method: 'POST' });
  },
  changePassword(currentPassword, newPassword) {
    return this.request('/api/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword }
    });
  },
  getUsers() {
    return this.request('/api/users');
  },
  createUser(payload) {
    return this.request('/api/users', { method: 'POST', body: payload });
  },
  dashboard() {
    return this.request('/api/dashboard');
  },
  inventory(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/api/inventory${q ? `?${q}` : ''}`);
  },
  createInventory(body) {
    return this.request('/api/inventory', { method: 'POST', body });
  },
  updateInventory(id, body) {
    return this.request(`/api/inventory/${id}`, { method: 'PUT', body });
  },
  deleteInventory(id) {
    return this.request(`/api/inventory/${id}`, { method: 'DELETE' });
  },
  network() {
    return this.request('/api/network');
  },
  createNetwork(body) {
    return this.request('/api/network', { method: 'POST', body });
  },
  updateNetwork(id, body) {
    return this.request(`/api/network/${id}`, { method: 'PUT', body });
  },
  deleteNetwork(id) {
    return this.request(`/api/network/${id}`, { method: 'DELETE' });
  },
  software(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/api/software${q ? `?${q}` : ''}`);
  },
  createSoftware(body) {
    return this.request('/api/software', { method: 'POST', body });
  },
  updateSoftware(id, body) {
    return this.request(`/api/software/${id}`, { method: 'PUT', body });
  },
  deleteSoftware(id) {
    return this.request(`/api/software/${id}`, { method: 'DELETE' });
  },
  cells() {
    return this.request('/api/cells');
  },
  cell(id) {
    return this.request(`/api/cells/${id}`);
  },
  createCell(body) {
    return this.request('/api/cells', { method: 'POST', body });
  },
  updateCell(id, body) {
    return this.request(`/api/cells/${id}`, { method: 'PUT', body });
  },
  deleteCell(id) {
    return this.request(`/api/cells/${id}`, { method: 'DELETE' });
  },
  kpis(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/api/kpis${q ? `?${q}` : ''}`);
  },
  createKpi(body) {
    return this.request('/api/kpis', { method: 'POST', body });
  },
  updateKpi(id, body) {
    return this.request(`/api/kpis/${id}`, { method: 'PUT', body });
  },
  deleteKpi(id) {
    return this.request(`/api/kpis/${id}`, { method: 'DELETE' });
  }
};
