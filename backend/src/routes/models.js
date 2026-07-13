const express = require('express');
const router = express.Router();
const { MODELS_FILE, readJSON, writeJSON } = require('../utils/storage');
const { v4: uuidv4 } = require('uuid');

// GET /api/models - 获取所有厂商及其模型
router.get('/', (req, res) => {
  const data = readJSON(MODELS_FILE);
  res.json({ providers: data.providers || [] });
});

// PUT /api/models/:providerId - 更新厂商配置
router.put('/:providerId', (req, res) => {
  const data = readJSON(MODELS_FILE);
  const idx = (data.providers || []).findIndex(p => p.id === req.params.providerId);
  if (idx === -1) return res.status(404).json({ error: '厂商不存在' });

  const allowed = ['baseUrl', 'apiKey', 'name'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      data.providers[idx][key] = req.body[key];
    }
  }

  writeJSON(MODELS_FILE, data);
  res.json(data.providers[idx]);
});

// POST /api/models/:providerId/test - 测试厂商连接
router.post('/:providerId/test', async (req, res) => {
  const data = readJSON(MODELS_FILE);
  const provider = (data.providers || []).find(p => p.id === req.params.providerId);
  if (!provider) return res.status(404).json({ error: '厂商不存在' });

  try {
    let testResult = false;

    if (provider.type === 'ollama') {
      const fetch = require('node-fetch');
      const response = await Promise.race([
        fetch(`${provider.baseUrl}/api/tags`, { method: 'GET' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 5000))
      ]);
      testResult = response.ok;
    } else {
      const fetch = require('node-fetch');
      const response = await Promise.race([
        fetch(`${provider.baseUrl}/v1/models`, {
          headers: { 'Authorization': `Bearer ${provider.apiKey}` }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 5000))
      ]);
      testResult = response.ok;
    }

    const idx = (data.providers || []).findIndex(p => p.id === provider.id);
    if (idx !== -1) {
      data.providers[idx].status = testResult ? 'online' : 'offline';
      writeJSON(MODELS_FILE, data);
    }

    res.json({
      success: testResult,
      status: testResult ? 'online' : 'offline',
      message: testResult ? '连接成功' : '连接失败'
    });
  } catch (err) {
    const idx = (data.providers || []).findIndex(p => p.id === provider.id);
    if (idx !== -1) {
      data.providers[idx].status = 'offline';
      writeJSON(MODELS_FILE, data);
    }
    res.json({ success: false, status: 'offline', message: err.message });
  }
});

// PUT /api/models/:providerId/models/:modelId - 更新模型（启用/禁用等）
router.put('/:providerId/models/:modelId', (req, res) => {
  const data = readJSON(MODELS_FILE);
  const provider = (data.providers || []).find(p => p.id === req.params.providerId);
  if (!provider) return res.status(404).json({ error: '厂商不存在' });

  const model = (provider.models || []).find(m => m.id === req.params.modelId);
  if (!model) return res.status(404).json({ error: '模型不存在' });

  const allowed = ['enabled', 'name', 'maxTokens', 'contextWindow'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      model[key] = req.body[key];
    }
  }

  writeJSON(MODELS_FILE, data);
  res.json(model);
});

// POST /api/models/:providerId/models - 添加自定义模型
router.post('/:providerId/models', (req, res) => {
  const { id, name, maxTokens, contextWindow, category } = req.body;
  if (!id || !name) return res.status(400).json({ error: '模型ID和名称不能为空' });

  const data = readJSON(MODELS_FILE);
  const provider = (data.providers || []).find(p => p.id === req.params.providerId);
  if (!provider) return res.status(404).json({ error: '厂商不存在' });

  const newModel = {
    id,
    name,
    maxTokens: maxTokens || 4096,
    contextWindow: contextWindow || 8192,
    category: category || 'custom',
    enabled: true
  };

  provider.models = provider.models || [];
  provider.models.push(newModel);
  writeJSON(MODELS_FILE, data);
  res.json(newModel);
});

// DELETE /api/models/:providerId/models/:modelId - 删除模型
router.delete('/:providerId/models/:modelId', (req, res) => {
  const data = readJSON(MODELS_FILE);
  const provider = (data.providers || []).find(p => p.id === req.params.providerId);
  if (!provider) return res.status(404).json({ error: '厂商不存在' });

  provider.models = (provider.models || []).filter(m => m.id !== req.params.modelId);
  writeJSON(MODELS_FILE, data);
  res.json({ success: true });
});

module.exports = router;
