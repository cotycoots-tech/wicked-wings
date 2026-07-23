const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const defaultDb = () => ({
  users: [],
  inventory: [],
  networkConfigs: [],
  softwarePackages: [],
  cells: [],
  kpis: [],
  sessions: {}
});

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
  }
}

function read() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function write(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function update(mutator) {
  const db = read();
  const result = mutator(db);
  write(db);
  return result;
}

module.exports = { read, write, update, ensureDb, DB_PATH, defaultDb };
