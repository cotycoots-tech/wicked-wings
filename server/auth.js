const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { read, update } = require('./store');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'vcb_session';

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  update((db) => {
    db.sessions[token] = { userId, expiresAt };
  });
  return { token, expiresAt };
}

function destroySession(token) {
  if (!token) return;
  update((db) => {
    delete db.sessions[token];
  });
}

function getSessionUser(token) {
  if (!token) return null;
  const db = read();
  const session = db.sessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    update((d) => {
      delete d.sessions[token];
    });
    return null;
  }
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return sanitizeUser(user);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt
  };
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = getSessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function canWrite(role) {
  return role === 'admin' || role === 'engineer';
}

module.exports = {
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
};
