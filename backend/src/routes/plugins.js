const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { PLUGINS_FILE, readJSON, writeJSON } = require('../utils/storage');

// GET /api/plugins - 获取所有插件
router.get('/', (req, res) => {
  const { status, keyword } = req.query;
  const data = readJSON(PLUGINS_FILE);
  let plugins = data.plugins || [];
  
  if (status) plugins = plugins.filter(p => p.status === status);
  if (keyword) plugins = plugins.filter(p => p.name.includes(keyword));
  
  res.json({ plugins });
});

// POST /api/plugins - 创建插件
router.post('/', (req, res) => {
  const { name, description, type, config } = req.body;
  
  if (!name) return res.status(400).json({ error: '插件名称不能为空' });
  
  const data = readJSON(PLUGINS_FILE);
  const plugins = data.plugins || [];
  
  if (plugins.some(p => p.name === name)) {
    return res.status(400).json({ error: '插件名称已存在' });
  }
  
  const newPlugin = {
    id: uuidv4(),
    name,
    description: description || '',
    type: type || 'http', // 'http' | 'function'
    status: 'draft',
    config: config || {
      method: 'POST',
      url: '',
      headers: {},
      params: [],
      auth: { type: 'none' }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  plugins.push(newPlugin);
  data.plugins = plugins;
  writeJSON(PLUGINS_FILE, data);
  res.json(newPlugin);
});

// GET /api/plugins/:id
router.get('/:id', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  const plugin = (data.plugins || []).find(p => p.id === req.params.id);
  if (!plugin) return res.status(404).json({ error: '插件不存在' });
  res.json(plugin);
});

// PUT /api/plugins/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const data = readJSON(PLUGINS_FILE);
  const plugins = data.plugins || [];
  const idx = plugins.findIndex(p => p.id === id);
  
  if (idx === -1) return res.status(404).json({ error: '插件不存在' });
  
  plugins[idx] = { ...plugins[idx], ...req.body, id, updatedAt: new Date().toISOString() };
  data.plugins = plugins;
  writeJSON(PLUGINS_FILE, data);
  res.json(plugins[idx]);
});

// POST /api/plugins/:id/publish
router.post('/:id/publish', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  const plugins = data.plugins || [];
  const idx = plugins.findIndex(p => p.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '插件不存在' });
  
  plugins[idx].status = 'published';
  plugins[idx].updatedAt = new Date().toISOString();
  
  data.plugins = plugins;
  writeJSON(PLUGINS_FILE, data);
  res.json(plugins[idx]);
});

// POST /api/plugins/:id/unpublish
router.post('/:id/unpublish', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  const plugins = data.plugins || [];
  const idx = plugins.findIndex(p => p.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '插件不存在' });
  
  plugins[idx].status = 'draft';
  plugins[idx].updatedAt = new Date().toISOString();
  
  data.plugins = plugins;
  writeJSON(PLUGINS_FILE, data);
  res.json(plugins[idx]);
});

// DELETE /api/plugins/:id
router.delete('/:id', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  data.plugins = (data.plugins || []).filter(p => p.id !== req.params.id);
  writeJSON(PLUGINS_FILE, data);
  res.json({ success: true });
});

// ========================
// Plugin test & usage
// ========================

// POST /api/plugins/:id/test - 测试HTTP插件
router.post('/:id/test', async (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  const plugin = (data.plugins || []).find(p => p.id === req.params.id);
  if (!plugin) return res.status(404).json({ error: '插件不存在' });

  const { variables } = req.body || {};
  const cfg = plugin.config || {};
  const vars = { ...(variables || {}), query: '测试查询', _now: new Date().toISOString() };

  try {
    let url = cfg.url || '';
    let body = cfg.body || '';
    const headers = { ...(cfg.headers || {}) };

    for (const [k, v] of Object.entries(vars)) {
      const regex = new RegExp(`{{${k}}}`, 'g');
      url = url.replace(regex, String(v));
      body = body.replace(regex, String(v));
      for (const hk of Object.keys(headers)) {
        headers[hk] = headers[hk].replace(regex, String(v));
      }
    }

    if (!url) return res.status(400).json({ error: '插件URL为空' });

    const fetchOptions = {
      method: (cfg.method || 'GET').toUpperCase(),
      headers: { 'User-Agent': 'MaiyuPluginTest/1.0' },
      timeout: 15000
    };

    for (const [k, v] of Object.entries(headers)) {
      if (v && v.trim()) fetchOptions.headers[k] = v;
    }

    if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method) && body) {
      const tb = body.trim();
      if (tb.startsWith('{') || tb.startsWith('[')) {
        fetchOptions.headers['Content-Type'] = fetchOptions.headers['Content-Type'] || 'application/json';
      }
      fetchOptions.body = tb;
    }

    const t0 = Date.now();
    const resp = await fetch(url, fetchOptions);
    const elapsed = Date.now() - t0;
    const contentType = resp.headers.get('content-type') || '';

    let resultData;
    if (contentType.includes('application/json')) {
      resultData = await resp.json();
    } else {
      resultData = await resp.text();
    }

    // Log usage
    trackPluginUsage(plugin.id, plugin.name, 'test', true, elapsed);

    res.json({
      success: resp.ok,
      statusCode: resp.status,
      elapsed,
      data: resultData,
      headers: Object.fromEntries(resp.headers.entries())
    });
  } catch (err) {
    trackPluginUsage(plugin.id, plugin.name, 'test', false, 0, err.message);
    res.json({ success: false, error: err.message, elapsed: 0 });
  }
});

// POST /api/plugins/mcp-servers/:id/test - 测试MCP连接
router.post('/mcp-servers/:id/test', async (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  const server = (data.mcpServers || []).find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'MCP服务器不存在' });

  const cfg = server.config || {};
  const t0 = Date.now();

  try {
    if (server.type === 'sse' && cfg.url) {
      const resp = await fetch(cfg.url, { method: 'HEAD', timeout: 10000 });
      const elapsed = Date.now() - t0;
      res.json({ success: resp.ok, statusCode: resp.status, elapsed, message: resp.ok ? 'SSE端点可达' : `HTTP ${resp.status}` });
    } else if (cfg.command) {
      // stdio type - just check if command exists
      const { execSync } = require('child_process');
      let cmd = cfg.command;
      if (cfg.args && cfg.args.length > 0) cmd += ' ' + cfg.args.join(' ');
      try {
        execSync(`where ${cfg.command.split(' ')[0]}`, { timeout: 5000 });
        const elapsed = Date.now() - t0;
        res.json({ success: true, elapsed, message: `命令 ${cfg.command} 已找到` });
      } catch {
        res.json({ success: false, elapsed: Date.now() - t0, error: `命令 ${cfg.command} 未找到` });
      }
    } else {
      res.status(400).json({ error: '无法测试：缺少URL或命令' });
    }
  } catch (err) {
    res.json({ success: false, error: err.message, elapsed: Date.now() - t0 });
  }
});

// GET /api/plugins/usage - 获取插件使用统计
router.get('/usage/list', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  const usage = data.pluginUsage || {};
  res.json({ usage });
});

// Track plugin usage
function trackPluginUsage(pluginId, pluginName, context, success, elapsed, error) {
  try {
    const data = readJSON(PLUGINS_FILE);
    if (!data.pluginUsage) data.pluginUsage = {};
    if (!data.pluginUsage[pluginId]) {
      data.pluginUsage[pluginId] = {
        id: pluginId,
        name: pluginName,
        totalCalls: 0,
        successCalls: 0,
        failCalls: 0,
        totalElapsed: 0,
        lastCall: null,
        lastError: null
      };
    }
    const u = data.pluginUsage[pluginId];
    u.totalCalls++;
    if (success) u.successCalls++; else u.failCalls++;
    u.totalElapsed += (elapsed || 0);
    u.lastCall = new Date().toISOString();
    if (error) u.lastError = error;
    u.name = pluginName; // keep name updated
    writeJSON(PLUGINS_FILE, data);
  } catch (e) { /* silent */ }
}

// ========================
// Phase 9: MCP Server 管理
// ========================

// GET /api/plugins/mcp-servers - 获取MCP服务器列表
router.get('/mcp-servers/list', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  const mcpServers = (data.mcpServers || []).map(s => ({ ...s, config: undefined }));
  res.json({ mcpServers });
});

// POST /api/plugins/mcp-servers - 添加MCP服务器
router.post('/mcp-servers', (req, res) => {
  const { name, description, command, args, env, url } = req.body;
  if (!name) return res.status(400).json({ error: '名称不能为空' });
  const data = readJSON(PLUGINS_FILE);
  if (!data.mcpServers) data.mcpServers = [];
  if (data.mcpServers.some(s => s.name === name)) {
    return res.status(400).json({ error: 'MCP服务器名称已存在' });
  }
  const server = {
    id: uuidv4(),
    name, description: description || '',
    type: url ? 'sse' : 'stdio',
    status: 'draft',
    config: { command: command || '', args: args || [], env: env || {}, url: url || '' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  data.mcpServers.push(server);
  writeJSON(PLUGINS_FILE, data);
  const clean = { ...server }; delete clean.config;
  res.json(clean);
});

// PUT /api/plugins/mcp-servers/:id - 编辑MCP服务器
router.put('/mcp-servers/:id', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  if (!data.mcpServers) return res.status(404).json({ error: '不存在' });
  const idx = data.mcpServers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'MCP服务器不存在' });
  const { config, ...rest } = req.body;
  data.mcpServers[idx] = { ...data.mcpServers[idx], ...rest, config: { ...data.mcpServers[idx].config, ...config }, updatedAt: new Date().toISOString() };
  writeJSON(PLUGINS_FILE, data);
  const clean = { ...data.mcpServers[idx] }; delete clean.config;
  res.json(clean);
});

// POST /api/plugins/mcp-servers/:id/publish
router.post('/mcp-servers/:id/publish', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  if (!data.mcpServers) return res.status(404).json({ error: '不存在' });
  const idx = data.mcpServers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'MCP服务器不存在' });
  data.mcpServers[idx].status = 'published';
  data.mcpServers[idx].updatedAt = new Date().toISOString();
  writeJSON(PLUGINS_FILE, data);
  const clean = { ...data.mcpServers[idx] }; delete clean.config;
  res.json(clean);
});

// DELETE /api/plugins/mcp-servers/:id
router.delete('/mcp-servers/:id', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  data.mcpServers = (data.mcpServers || []).filter(s => s.id !== req.params.id);
  writeJSON(PLUGINS_FILE, data);
  res.json({ success: true });
});

// GET /api/plugins/builtin - 内置插件列表
router.get('/builtin/list', (req, res) => {
  res.json({
    builtin: [
      { id: 'web-search', name: '网页搜索', icon: '🌐', description: '搜索互联网获取实时信息' },
      { id: 'calculator', name: '计算器', icon: '🔢', description: '执行数学计算' },
      { id: 'datetime', name: '日期时间', icon: '📅', description: '获取当前日期时间' },
      { id: 'weather', name: '天气查询', icon: '🌤️', description: '查询城市天气信息' },
      { id: 'translate', name: '翻译', icon: '🗣️', description: '多语言翻译' },
      { id: 'ocr', name: '图片识别', icon: '🔍', description: '图片文字识别(OCR)' },
      { id: 'dingtalk', name: '钉钉通知', icon: '📩', description: '发送钉钉消息通知' },
      { id: 'email', name: '邮件通知', icon: '📧', description: '发送邮件通知' }
    ]
  });
});

// ========================
// Phase 9: Light App 插件管理
// ========================

// GET /api/plugins/light-apps - 获取轻应用列表
router.get('/light-apps/list', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  res.json({ lightApps: data.lightApps || [] });
});

// POST /api/plugins/light-apps - 添加轻应用
router.post('/light-apps', (req, res) => {
  const { name, description, endpoint, icon } = req.body;
  if (!name || !endpoint) return res.status(400).json({ error: '名称和端点不能为空' });
  const data = readJSON(PLUGINS_FILE);
  if (!data.lightApps) data.lightApps = [];
  const app = {
    id: uuidv4(),
    name, description: description || '', endpoint,
    icon: icon || '📱',
    status: 'draft',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  data.lightApps.push(app);
  writeJSON(PLUGINS_FILE, data);
  res.json(app);
});

// PUT /api/plugins/light-apps/:id
router.put('/light-apps/:id', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  if (!data.lightApps) return res.status(404).json({ error: '不存在' });
  const idx = data.lightApps.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '轻应用不存在' });
  data.lightApps[idx] = { ...data.lightApps[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  writeJSON(PLUGINS_FILE, data);
  res.json(data.lightApps[idx]);
});

// POST /api/plugins/light-apps/:id/publish
router.post('/light-apps/:id/publish', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  if (!data.lightApps) return res.status(404).json({ error: '不存在' });
  const idx = data.lightApps.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '轻应用不存在' });
  data.lightApps[idx].status = 'published';
  data.lightApps[idx].updatedAt = new Date().toISOString();
  writeJSON(PLUGINS_FILE, data);
  res.json(data.lightApps[idx]);
});

// DELETE /api/plugins/light-apps/:id
router.delete('/light-apps/:id', (req, res) => {
  const data = readJSON(PLUGINS_FILE);
  data.lightApps = (data.lightApps || []).filter(a => a.id !== req.params.id);
  writeJSON(PLUGINS_FILE, data);
  res.json({ success: true });
});

module.exports = router;
// Also export helper for use by other modules
module.exports.trackPluginUsage = trackPluginUsage;
