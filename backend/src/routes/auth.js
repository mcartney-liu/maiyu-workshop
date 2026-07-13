const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { DATA_DIR, readJSON, writeJSON } = require('../utils/storage');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Initialize files
if (!fs.existsSync(USERS_FILE)) {
  // Default admin account
  const adminId = uuidv4();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword('admin123', salt);
  fs.writeFileSync(USERS_FILE, JSON.stringify({
    users: [{
      id: adminId,
      username: 'admin',
      displayName: '管理员',
      passwordHash: hash,
      salt,
      role: 'admin',
      createdAt: new Date().toISOString()
    }]
  }, null, 2));
}
if (!fs.existsSync(SESSIONS_FILE)) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions: {} }, null, 2));
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

// Legacy hash for migration (10k iterations)
function hashPasswordLegacy(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Cleanup expired sessions (call periodically)
function cleanupSessions() {
  const now = Date.now();
  const data = readJSON(SESSIONS_FILE);
  let changed = false;
  for (const [token, session] of Object.entries(data.sessions || {})) {
    if (session.expiresAt && now > session.expiresAt) {
      delete data.sessions[token];
      changed = true;
    }
  }
  if (changed) writeJSON(SESSIONS_FILE, data);
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  
  const data = readJSON(USERS_FILE);
  const user = (data.users || []).find(u => u.username === username);
  
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  
  let hash = hashPassword(password, user.salt);
  // Migration: if hash doesn't match, try legacy (10k iter) hash
  if (hash !== user.passwordHash) {
    const legacyHash = hashPasswordLegacy(password, user.salt);
    if (legacyHash === user.passwordHash) {
      // Auto-migrate to new hash
      user.salt = crypto.randomBytes(16).toString('hex');
      user.passwordHash = hashPassword(password, user.salt);
      writeJSON(USERS_FILE, data);
      hash = user.passwordHash;
    }
  }
  if (hash !== user.passwordHash) return res.status(401).json({ error: '用户名或密码错误' });
  
  // Create session
  const token = generateToken();
  const sessionData = readJSON(SESSIONS_FILE);
  sessionData.sessions[token] = {
    userId: user.id,
    username: user.username,
    role: user.role,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  writeJSON(SESSIONS_FILE, sessionData);
  
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    }
  });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  if (username.length < 3) return res.status(400).json({ error: '用户名至少3个字符' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });
  
  const data = readJSON(USERS_FILE);
  if ((data.users || []).some(u => u.username === username)) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  
  const user = {
    id: uuidv4(),
    username,
    displayName: displayName || username,
    passwordHash: hash,
    salt,
    role: 'user',
    createdAt: new Date().toISOString()
  };
  
  data.users.push(user);
  writeJSON(USERS_FILE, data);
  
  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    }
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const data = readJSON(SESSIONS_FILE);
    delete data.sessions[token];
    writeJSON(SESSIONS_FILE, data);
  }
  res.json({ success: true });
});

// GET /api/auth/me - Get current user from token
router.get('/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  
  const data = readJSON(SESSIONS_FILE);
  const session = data.sessions[token];
  if (!session) return res.status(401).json({ error: '会话已过期' });
  
  const userData = readJSON(USERS_FILE);
  const user = (userData.users || []).find(u => u.id === session.userId);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  
  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    }
  });
});

// GET /api/auth/users - List users (admin only)
router.get('/users', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const sessionData = readJSON(SESSIONS_FILE);
  const session = sessionData.sessions[token];
  if (!session || session.role !== 'admin') return res.status(403).json({ error: '无权限' });
  
  const data = readJSON(USERS_FILE);
  const users = (data.users || []).map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt
  }));
  res.json({ users });
});

// PUT /api/auth/password - Change password (requires auth)
router.put('/password', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '请先登录' });
  
  const sessionData = readJSON(SESSIONS_FILE);
  const session = sessionData.sessions[token];
  if (!session) return res.status(401).json({ error: '会话已过期，请重新登录' });
  if (session.expiresAt && Date.now() > session.expiresAt) {
    delete sessionData.sessions[token];
    writeJSON(SESSIONS_FILE, sessionData);
    return res.status(401).json({ error: '会话已过期，请重新登录' });
  }
  
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请输入旧密码和新密码' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6个字符' });
  
  const userData = readJSON(USERS_FILE);
  const user = (userData.users || []).find(u => u.id === session.userId);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  
  const oldHash = hashPassword(oldPassword, user.salt);
  if (oldHash !== user.passwordHash) return res.status(400).json({ error: '旧密码错误' });
  
  // Update password
  user.salt = crypto.randomBytes(16).toString('hex');
  user.passwordHash = hashPassword(newPassword, user.salt);
  writeJSON(USERS_FILE, userData);
  
  // Invalidate all sessions for this user (force re-login)
  for (const [t, s] of Object.entries(sessionData.sessions || {})) {
    if (s.userId === user.id && t !== token) {
      delete sessionData.sessions[t];
    }
  }
  writeJSON(SESSIONS_FILE, sessionData);
  
  res.json({ success: true, message: '密码修改成功' });
});

// Auth middleware
function requireAuth(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '请先登录' });
    
    const data = readJSON(SESSIONS_FILE);
    const session = data.sessions[token];
    if (!session) return res.status(401).json({ error: '会话已过期，请重新登录' });
    
    // Check expiry
    if (session.expiresAt && Date.now() > session.expiresAt) {
      delete data.sessions[token];
      writeJSON(SESSIONS_FILE, data);
      return res.status(401).json({ error: '会话已过期，请重新登录' });
    }
    
    if (roles.length > 0 && !roles.includes(session.role)) {
      return res.status(403).json({ error: '无权限访问' });
    }
    
    req.user = session;
    next();
  };
}

module.exports = router;
module.exports.requireAuth = requireAuth;
