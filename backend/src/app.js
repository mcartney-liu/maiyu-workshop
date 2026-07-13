const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const agentRoutes = require('./routes/agents');
const knowledgeRoutes = require('./routes/knowledge');
const pluginRoutes = require('./routes/plugins');
const conversationRoutes = require('./routes/conversations');
const modelRoutes = require('./routes/models');
const uploadRoutes = require('./routes/upload');
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./routes/auth');
const businessRoutes = require('./routes/business');
const workflowRoutes = require('./routes/workflow');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving (public)
app.use('/uploads', express.static(path.join(__dirname, '../data/uploads')));

// === Auth middleware: protect all /api/* except whitelist ===
// Public endpoints that don't require authentication:
const publicPaths = [
  '/api/auth',         // auth routes (login/register have their own internal checks)
  '/api/health',       // health check
];
const publicPrefixes = [
  '/api/conversations/', // public chat (SSE + conversation CRUD for public-facing chat)
  '/api/agents/',        // public agent listing & detail (GET only by convention)
  '/api/knowledge/',     // public knowledge base listing (GET only)
];
app.use((req, res, next) => {
  // Only apply to /api/* routes
  if (!req.path.startsWith('/api')) return next();
  
  // 1. Exact match whitelist
  if (publicPaths.some(w => req.path === w || req.path.startsWith(w + '/'))) return next();
  
  // 2. Prefix match for public resource access
  if (publicPrefixes.some(w => req.path.startsWith(w))) {
    // For public prefixes, allow GET/HEAD/OPTIONS, require auth for modifications
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // SSE chat/generate are POST but needed for public chat
    if (req.method === 'POST' && (req.path.endsWith('/chat') || req.path.endsWith('/generate'))) return next();
  }
  
  // 3. Require authentication for everything else
  return requireAuth()(req, res, next);
});

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/workflow', workflowRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: '麦语工坊', version: '1.0.0' });
});

// Serve frontend static files
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// SPA catch-all: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// Only start the HTTP server when run directly (local `node src/app.js`).
// Inside Vercel serverless this module is required by the function entry and
// must NOT call listen().
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🌟 麦语工坊后端服务已启动`);
    console.log(`📡 监听端口: http://localhost:${PORT}`);
    console.log(`🔒 API认证已启用 (白名单: /api/auth, /api/health)`);
    console.log(`💡 API文档: http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
