const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { AGENTS_FILE, CONVERSATIONS_DIR, MODELS_FILE, readJSON, writeJSON, findModelConfig } = require('../utils/storage');

// GET /api/agents - 获取所有智能体（支持按分类过滤）
router.get('/', (req, res) => {
  const { categoryId, keyword, type } = req.query;
  const data = readJSON(AGENTS_FILE);
  let agents = data.agents || [];
  
  if (categoryId && categoryId !== 'all') {
    agents = agents.filter(a => a.categoryId === categoryId);
  }
  if (keyword) {
    agents = agents.filter(a => 
      a.name.includes(keyword) || (a.description || '').includes(keyword)
    );
  }
  if (type) {
    agents = agents.filter(a => a.type === type);
  }
  
  res.json({ agents, categories: data.categories || [] });
});

// GET /api/agents/categories - 获取分类列表
router.get('/categories', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  res.json({ categories: data.categories || [] });
});

// POST /api/agents/categories - 创建分类
router.post('/categories', (req, res) => {
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ error: '分类名称不能为空' });
  
  const data = readJSON(AGENTS_FILE);
  const categories = data.categories || [];
  
  // Max 2 levels
  if (parentId) {
    const parent = categories.find(c => c.id === parentId);
    if (parent && parent.parentId) {
      return res.status(400).json({ error: '已超过最大层级限制' });
    }
  }
  
  const newCat = {
    id: uuidv4(),
    name,
    parentId: parentId || null,
    createdAt: new Date().toISOString()
  };
  
  categories.push(newCat);
  data.categories = categories;
  writeJSON(AGENTS_FILE, data);
  res.json(newCat);
});

// PUT /api/agents/categories/:id - 更新分类
router.put('/categories/:id', (req, res) => {
  const { id } = req.params;
  const { name, parentId } = req.body;
  
  const data = readJSON(AGENTS_FILE);
  const categories = data.categories || [];
  const idx = categories.findIndex(c => c.id === id);
  
  if (idx === -1) return res.status(404).json({ error: '分类不存在' });
  
  if (name) categories[idx].name = name;
  if (parentId !== undefined) categories[idx].parentId = parentId;
  
  data.categories = categories;
  writeJSON(AGENTS_FILE, data);
  res.json(categories[idx]);
});

// DELETE /api/agents/categories/:id - 删除分类（级联删除子分类和智能体）
router.delete('/categories/:id', (req, res) => {
  const { id } = req.params;
  const data = readJSON(AGENTS_FILE);
  let categories = data.categories || [];
  let agents = data.agents || [];
  
  // Find all categories to delete (including children)
  const toDelete = new Set([id]);
  categories.forEach(c => {
    if (c.parentId === id) toDelete.add(c.id);
  });
  
  data.categories = categories.filter(c => !toDelete.has(c.id));
  data.agents = agents.filter(a => !toDelete.has(a.categoryId));
  
  writeJSON(AGENTS_FILE, data);
  res.json({ success: true });
});

// POST /api/agents - 创建智能体
router.post('/', (req, res) => {
  const { name, description, type, buildMode, categoryId, avatar } = req.body;
  
  if (!name) return res.status(400).json({ error: '智能体名称不能为空' });
  if (!type) return res.status(400).json({ error: '请选择智能体类型' });
  if (!buildMode) return res.status(400).json({ error: '请选择构建方式' });
  if (!categoryId) return res.status(400).json({ error: '请选择所属分类' });
  
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  
  // Name uniqueness check
  if (agents.some(a => a.name === name)) {
    return res.status(400).json({ error: '智能体名称已存在，请使用其他名称' });
  }
  
  const newAgent = {
    id: uuidv4(),
    name,
    description: description || '',
    type, // 'chat' | 'generate'
    buildMode, // 'simple' | 'workflow'
    categoryId,
    avatar: avatar || '🤖',
    status: 'draft', // 'draft' | 'published'
    config: {
      // Simple mode config
      modelId: '',
      temperature: 0.7,
      topP: 0.9,
      maxOutput: 2048,
      prompts: [{ role: 'user', content: '' }],
      variables: [],
      knowledgeBases: [],
      plugins: [],
      greeting: '',
      suggestedQuestions: [],
      features: {
        nextQuestions: false,
        rawTextRender: false
      }
    },
    workflow: buildMode === 'workflow' ? { enabled: true, nodes: [], edges: [] } : null, // Workflow mode config
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  agents.push(newAgent);
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(newAgent);
});

// GET /api/agents/:id - 获取单个智能体
router.get('/:id', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  const agent = (data.agents || []).find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  res.json(agent);
});

// PUT /api/agents/:id - 更新智能体配置
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const idx = agents.findIndex(a => a.id === id);
  
  if (idx === -1) return res.status(404).json({ error: '智能体不存在' });
  
  const updates = req.body;
  
  // Name uniqueness check
  if (updates.name && updates.name !== agents[idx].name) {
    if (agents.some(a => a.name === updates.name && a.id !== id)) {
      return res.status(400).json({ error: '智能体名称已存在' });
    }
  }
  
  agents[idx] = {
    ...agents[idx],
    ...updates,
    id,
    updatedAt: new Date().toISOString()
  };
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(agents[idx]);
});

// POST /api/agents/:id/publish - 发布智能体
router.post('/:id/publish', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const idx = agents.findIndex(a => a.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '智能体不存在' });
  
  const agent = agents[idx];
  if (!agent.config.modelId) {
    return res.status(400).json({ error: '请先选择模型服务' });
  }
  
  agents[idx].status = 'published';
  agents[idx].publishedAt = new Date().toISOString();
  agents[idx].updatedAt = new Date().toISOString();
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(agents[idx]);
});

// POST /api/agents/:id/unpublish - 下线智能体
router.post('/:id/unpublish', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const idx = agents.findIndex(a => a.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '智能体不存在' });
  
  agents[idx].status = 'draft';
  agents[idx].updatedAt = new Date().toISOString();
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(agents[idx]);
});

// DELETE /api/agents/:id - 删除智能体
router.delete('/:id', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  data.agents = (data.agents || []).filter(a => a.id !== req.params.id);
  writeJSON(AGENTS_FILE, data);
  res.json({ success: true });
});

// POST /api/agents/:id/copy - 复制智能体
router.post('/:id/copy', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const agent = agents.find(a => a.id === req.params.id);
  
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  
  const copy = {
    ...JSON.parse(JSON.stringify(agent)),
    id: uuidv4(),
    name: `${agent.name}_副本`,
    status: 'draft',
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  agents.push(copy);
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(copy);
});

// POST /api/agents/:id/move - 移动智能体到其他分类
router.post('/:id/move', (req, res) => {
  const { id } = req.params;
  const { categoryId } = req.body;
  
  if (!categoryId) return res.status(400).json({ error: '请选择目标分类' });
  
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const idx = agents.findIndex(a => a.id === id);
  
  if (idx === -1) return res.status(404).json({ error: '智能体不存在' });
  
  agents[idx].categoryId = categoryId;
  agents[idx].updatedAt = new Date().toISOString();
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(agents[idx]);
});

// POST /api/agents/batch - 批量操作
router.post('/batch', (req, res) => {
  const { action, ids, categoryId } = req.body;
  
  if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请选择操作和智能体' });
  }
  
  const data = readJSON(AGENTS_FILE);
  let agents = data.agents || [];
  let count = 0;
  
  switch (action) {
    case 'publish':
      agents = agents.map(a => {
        if (ids.includes(a.id) && a.status === 'draft') {
          count++;
          return { ...a, status: 'published', publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        }
        return a;
      });
      break;
    case 'unpublish':
      agents = agents.map(a => {
        if (ids.includes(a.id) && a.status === 'published') {
          count++;
          return { ...a, status: 'draft', updatedAt: new Date().toISOString() };
        }
        return a;
      });
      break;
    case 'delete':
      const beforeCount = agents.length;
      agents = agents.filter(a => !ids.includes(a.id));
      count = beforeCount - agents.length;
      break;
    case 'move':
      if (!categoryId) return res.status(400).json({ error: '请选择目标分类' });
      agents = agents.map(a => {
        if (ids.includes(a.id)) {
          count++;
          return { ...a, categoryId, updatedAt: new Date().toISOString() };
        }
        return a;
      });
      break;
    default:
      return res.status(400).json({ error: '不支持的操作' });
  }
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json({ success: true, count });
});

// POST /api/agents/export - 导出智能体（批量）
router.post('/export', (req, res) => {
  const { ids } = req.body;
  const data = readJSON(AGENTS_FILE);
  let agents = data.agents || [];
  
  if (ids && Array.isArray(ids) && ids.length > 0) {
    agents = agents.filter(a => ids.includes(a.id));
  }
  
  // Clean up for export (remove internal IDs, keep publish state)
  const exported = agents.map(a => ({
    name: a.name,
    description: a.description,
    type: a.type,
    buildMode: a.buildMode,
    avatar: a.avatar,
    config: a.config,
    workflow: a.workflow,
    phrases: a.phrases || [],
    exportedAt: new Date().toISOString(),
    version: 'maiyu-1.0'
  }));
  
  res.json({ agents: exported, count: exported.length });
});

// POST /api/agents/import - 导入智能体
router.post('/import', (req, res) => {
  const { agents: importedAgents } = req.body;
  
  if (!importedAgents || !Array.isArray(importedAgents) || importedAgents.length === 0) {
    return res.status(400).json({ error: '无效的导入数据' });
  }
  
  const data = readJSON(AGENTS_FILE);
  let existing = data.agents || [];
  let imported = 0;
  let skipped = 0;
  
  for (const importedAgent of importedAgents) {
    if (!importedAgent.name || !importedAgent.type) {
      skipped++;
      continue;
    }
    
    const newAgent = {
      id: uuidv4(),
      name: importedAgent.name,
      description: importedAgent.description || '',
      type: importedAgent.type,
      buildMode: importedAgent.buildMode || 'simple',
      categoryId: existing.length > 0 ? existing[0].categoryId : '',
      avatar: importedAgent.avatar || '🤖',
      status: 'draft',
      config: importedAgent.config || {
        modelId: '',
        temperature: 0.7,
        topP: 0.9,
        maxOutput: 2048,
        prompts: [{ role: 'user', content: '' }],
        variables: [],
        knowledgeBases: [],
        plugins: [],
        greeting: '',
        suggestedQuestions: []
      },
      workflow: importedAgent.workflow || null,
      phrases: importedAgent.phrases || [],
      publishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    existing.push(newAgent);
    imported++;
  }
  
  data.agents = existing;
  writeJSON(AGENTS_FILE, data);
  res.json({ success: true, imported, skipped });
});

// GET /api/agents/:id/phrases - 获取快捷短语
router.get('/:id/phrases', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  const agent = (data.agents || []).find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  res.json({ phrases: agent.phrases || [] });
});

// POST /api/agents/:id/phrases - 添加快捷短语
router.post('/:id/phrases', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '短语内容不能为空' });
  
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const idx = agents.findIndex(a => a.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '智能体不存在' });
  
  const phrases = agents[idx].phrases || [];
  const newPhrase = {
    id: uuidv4(),
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  phrases.push(newPhrase);
  agents[idx].phrases = phrases;
  agents[idx].updatedAt = new Date().toISOString();
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(newPhrase);
});

// PUT /api/agents/:id/phrases/:phraseId - 更新快捷短语
router.put('/:id/phrases/:phraseId', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '短语内容不能为空' });
  
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const idx = agents.findIndex(a => a.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '智能体不存在' });
  
  const phrases = agents[idx].phrases || [];
  const phraseIdx = phrases.findIndex(p => p.id === req.params.phraseId);
  if (phraseIdx === -1) return res.status(404).json({ error: '短语不存在' });
  
  phrases[phraseIdx].text = text.trim();
  agents[idx].phrases = phrases;
  agents[idx].updatedAt = new Date().toISOString();
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json(phrases[phraseIdx]);
});

// DELETE /api/agents/:id/phrases/:phraseId - 删除快捷短语
router.delete('/:id/phrases/:phraseId', (req, res) => {
  const data = readJSON(AGENTS_FILE);
  const agents = data.agents || [];
  const idx = agents.findIndex(a => a.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '智能体不存在' });
  
  agents[idx].phrases = (agents[idx].phrases || []).filter(p => p.id !== req.params.phraseId);
  agents[idx].updatedAt = new Date().toISOString();
  
  data.agents = agents;
  writeJSON(AGENTS_FILE, data);
  res.json({ success: true });
});

// GET /api/agents/:id/metrics - 获取智能体使用指标
router.get('/:id/metrics', (req, res) => {
  const { id } = req.params;
  const data = readJSON(AGENTS_FILE);
  const agent = (data.agents || []).find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  
  // Read conversations to calculate metrics
  let totalMessages = 0;
  let totalConversations = 0;
  let todayMessages = 0;
  let todayConversations = 0;
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    if (fs.existsSync(CONVERSATIONS_DIR)) {
      const agentDir = path.join(CONVERSATIONS_DIR, id);
      if (fs.existsSync(agentDir)) {
        const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.json'));
        totalConversations = files.length;
        
        for (const file of files) {
          const convData = JSON.parse(fs.readFileSync(path.join(agentDir, file), 'utf-8'));
          const messages = convData.messages || [];
          totalMessages += messages.length;
          
          // Count today's messages
          const todayMsgs = messages.filter(m => m.timestamp && m.timestamp.startsWith(today)).length;
          todayMessages += todayMsgs;
          
          // Count today's conversations (created today)
          if (convData.createdAt && convData.createdAt.startsWith(today)) {
            todayConversations++;
          }
        }
      }
    }
  } catch (e) {
    console.error('Metrics calculation error:', e);
  }
  
  res.json({
    agentId: id,
    agentName: agent.name,
    totalMessages,
    totalConversations,
    todayMessages,
    todayConversations,
    status: agent.status,
    publishedAt: agent.publishedAt,
    createdAt: agent.createdAt
  });
});

// POST /api/agents/:id/evaluate - 智能体评测 (实际调用LLM)
router.post('/:id/evaluate', async (req, res) => {
  const { id } = req.params;
  const { testCases } = req.body;
  
  if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
    return res.status(400).json({ error: '请提供测试用例' });
  }
  
  const data = readJSON(AGENTS_FILE);
  const agent = (data.agents || []).find(a => a.id === id);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  
  const taskId = uuidv4();
  const results = testCases.map((tc, index) => ({
    id: index + 1,
    input: tc.input || tc.question || '',
    expected: tc.expected || tc.answer || '',
    actual: null,
    score: null,
    status: 'pending',
    error: null
  }));
  
  // Start evaluation
  res.json({
    taskId,
    agentId: id,
    agentName: agent.name,
    totalCases: testCases.length,
    completedCases: 0,
    results,
    status: 'running',
    startedAt: new Date().toISOString()
  });
  
  // Async evaluation execution
  evaluateAgent(agent, results, taskId).catch(err => {
    console.error(`[Evaluate] Task ${taskId} failed:`, err.message);
  });
});

// GET /api/agents/:id/evaluate/:taskId - 查询评测结果
router.get('/:id/evaluate/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = evalTasks.get(taskId);
  if (!task) return res.status(404).json({ error: '评测任务不存在或已过期' });
  res.json(task);
});

// In-memory evaluation task store
const evalTasks = new Map();
const EVAL_TASK_TTL = 30 * 60 * 1000; // 30 min TTL

// Actual evaluation execution
async function evaluateAgent(agent, results, taskId) {
  const modelsData = readJSON(MODELS_FILE);
  const providerId = agent.config.providerId;
  const modelId = agent.config.modelId;
  
  if (!providerId || !modelId) {
    for (const r of results) {
      r.status = 'error';
      r.error = '未配置模型服务';
    }
    evalTasks.set(taskId, { taskId, agentId: agent.id, results, status: 'completed', completedCases: results.length, totalCases: results.length });
    return;
  }
  
  const modelCfg = findModelConfig(modelsData, providerId, modelId);
  if (!modelCfg) {
    for (const r of results) {
      r.status = 'error';
      r.error = '模型服务不可用';
    }
    evalTasks.set(taskId, { taskId, agentId: agent.id, results, status: 'completed', completedCases: results.length, totalCases: results.length });
    return;
  }
  
  const { provider } = modelCfg;
  const model = modelCfg.model;
  
  // Build system prompt from agent config
  let systemPrompt = '';
  for (const prompt of (agent.config.prompts || [])) {
    if (prompt.role === 'system') systemPrompt += prompt.content + '\n';
  }
  
  let completed = 0;
  for (const r of results) {
    try {
      r.status = 'running';
      completed++;
      
      const messages = [];
      if (systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt.trim() });
      }
      messages.push({ role: 'user', content: r.input });
      
      let actual = '';
      
      if (provider.type === 'ollama') {
        const response = await fetch(`${provider.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.id,
            messages,
            stream: false,
            options: { temperature: agent.config.temperature || 0.7 }
          })
        });
        if (!response.ok) throw new Error(`Ollama API错误: ${response.status}`);
        const body = await response.json();
        actual = body.message?.content || '';
      } else {
        const chatPath = provider.chatPath || '/v1/chat/completions';
        const response = await fetch(`${provider.baseUrl}${chatPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify({
            model: model.id,
            messages,
            temperature: agent.config.temperature || 0.7,
            max_tokens: agent.config.maxOutput || 2048
          })
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API错误: ${response.status} - ${errText}`);
        }
        const body = await response.json();
        actual = body.choices?.[0]?.message?.content || '';
      }
      
      r.actual = actual;
      r.status = 'done';
      
      // Simple similarity scoring
      if (r.expected) {
        r.score = calcSimilarity(r.expected, actual);
      }
    } catch (err) {
      r.status = 'error';
      r.error = err.message;
    }
    
    // Update task in store
    evalTasks.set(taskId, {
      taskId,
      agentId: agent.id,
      agentName: agent.name,
      results,
      totalCases: results.length,
      completedCases: completed,
      status: completed >= results.length ? 'completed' : 'running',
      startedAt: evalTasks.get(taskId)?.startedAt || new Date().toISOString()
    });
  }
  
  // Final update
  evalTasks.set(taskId, {
    taskId,
    agentId: agent.id,
    agentName: agent.name,
    results,
    totalCases: results.length,
    completedCases: completed,
    status: 'completed',
    startedAt: evalTasks.get(taskId)?.startedAt || new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
}

// Simple text similarity (Jaccard-like word overlap)
function calcSimilarity(expected, actual) {
  if (!expected || !actual) return 0;
  const normalize = s => s.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(Boolean);
  const expWords = new Set(normalize(expected));
  const actWords = new Set(normalize(actual));
  if (expWords.size === 0) return 0;
  let overlap = 0;
  for (const w of expWords) {
    if (actWords.has(w)) overlap++;
  }
  return Math.round((overlap / expWords.size) * 100);
}

// GET /api/agents/authorized - 获取授权智能体列表
router.get('/authorized', (req, res) => {
  // In a single-user local deployment, return empty list
  // In multi-user scenario, this would return agents shared by other users
  // For MVP, return sample data structure
  res.json({ 
    agents: [],
    message: '授权智能体功能将在多用户版本中提供'
  });
});

module.exports = router;
