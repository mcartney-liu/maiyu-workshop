const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { AGENTS_FILE, KNOWLEDGE_FILE, MODELS_FILE, PLUGINS_FILE, CONVERSATIONS_DIR, readJSON, writeJSON, findModelConfig } = require('../utils/storage');
const { vectorSearch } = require('./knowledge');
const { executeWorkflow } = require('./workflow');
const pluginRouter = require('./plugins');
const trackPluginUsage = pluginRouter.trackPluginUsage;

// GET /api/conversations/:agentId - 获取某智能体的对话列表
router.get('/:agentId', (req, res) => {
  const convFile = path.join(CONVERSATIONS_DIR, `${req.params.agentId}.json`);
  if (!fs.existsSync(convFile)) return res.json({ conversations: [] });
  
  const data = readJSON(convFile);
  res.json({ conversations: (data.conversations || []).map(c => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: (c.messages || []).length
  }))});
});

// POST /api/conversations/:agentId - 新建对话
router.post('/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { variables } = req.body;
  
  const agentsData = readJSON(AGENTS_FILE);
  const agent = (agentsData.agents || []).find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  
  const convFile = path.join(CONVERSATIONS_DIR, `${agentId}.json`);
  const data = fs.existsSync(convFile) ? readJSON(convFile) : { conversations: [] };
  
  const conv = {
    id: uuidv4(),
    agentId,
    title: '新对话',
    variables: variables || {},
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Add greeting as first message
  if (agent.config.greeting) {
    conv.messages.push({
      id: uuidv4(),
      role: 'assistant',
      content: agent.config.greeting,
      createdAt: new Date().toISOString()
    });
  }
  
  data.conversations.unshift(conv);
  // Keep max 50 conversations per agent
  data.conversations = data.conversations.slice(0, 50);
  
  writeJSON(convFile, data);
  res.json(conv);
});

// GET /api/conversations/:agentId/:convId - 获取对话历史
router.get('/:agentId/:convId', (req, res) => {
  const convFile = path.join(CONVERSATIONS_DIR, `${req.params.agentId}.json`);
  if (!fs.existsSync(convFile)) return res.status(404).json({ error: '对话不存在' });
  
  const data = readJSON(convFile);
  const conv = (data.conversations || []).find(c => c.id === req.params.convId);
  if (!conv) return res.status(404).json({ error: '对话不存在' });
  
  res.json(conv);
});

// POST /api/conversations/:agentId/:convId/chat - 发送消息
router.post('/:agentId/:convId/chat', async (req, res) => {
  const { agentId, convId } = req.params;
  const { message, variables } = req.body;
  
  if (!message) return res.status(400).json({ error: '消息内容不能为空' });
  
  // Load agent
  const agentsData = readJSON(AGENTS_FILE);
  const agent = (agentsData.agents || []).find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  
  // Load model config from new provider structure
  const modelsData = readJSON(MODELS_FILE);
  const providerId = agent.config.providerId;
  const modelId = agent.config.modelId;
  
  if (!providerId || !modelId) {
    return res.status(400).json({ error: '未配置模型服务，请在智能体配置中选择模型' });
  }
  
  const modelCfg = findModelConfig(modelsData, providerId, modelId);
  if (!modelCfg) {
    return res.status(400).json({ error: '模型服务不可用或已禁用，请检查模型管理' });
  }
  
  const { provider } = modelCfg;
  const model = modelCfg.model;
  
  // Load conversation
  const convFile = path.join(CONVERSATIONS_DIR, `${agentId}.json`);
  const convData = fs.existsSync(convFile) ? readJSON(convFile) : { conversations: [] };
  const convIdx = convData.conversations.findIndex(c => c.id === convId);
  if (convIdx === -1) return res.status(404).json({ error: '对话不存在' });
  
  const conv = convData.conversations[convIdx];
  
  // Add user message
  const userMsg = {
    id: uuidv4(),
    role: 'user',
    content: message,
    createdAt: new Date().toISOString()
  };
  conv.messages.push(userMsg);
  
  // === Workflow Mode ===
  if (agent.workflow && agent.workflow.enabled) {
    console.log(`[Workflow] 执行工作流, agent=${agent.name}, query="${message}"`);
    return executeChatWorkflow(agent, message, conv, convFile, convData, convIdx, userMsg, modelCfg, res);
  }
  
  // Build knowledge context using vector search
  let knowledgeContext = '';
  let citationSources = [];
  if (agent.config.knowledgeBases && agent.config.knowledgeBases.length > 0) {
    const knowledgeData = readJSON(KNOWLEDGE_FILE);
    const selectedLibs = (knowledgeData.libraries || []).filter(
      k => agent.config.knowledgeBases.includes(k.id) && k.status === 'published'
    );
    
    if (selectedLibs.length > 0) {
      const searchResults = await vectorSearch(message, selectedLibs, 
        agent.config.topK || 5,
        agent.config.confidence || 0.3
      );
      
      if (searchResults.length > 0) {
        citationSources = searchResults.map(r => ({ source: r.source || r.docName, score: r.score, snippet: (r.content || '').substring(0, 100) }));
        knowledgeContext = '\n\n以下是相关知识库内容，请优先参考：\n' + 
          searchResults.map((r, i) => `[${i + 1}. 来源: ${r.source} | 相关度: ${r.score.toFixed(2)}]\n${r.content}`).join('\n\n');
        console.log(`[Knowledge] 检索到 ${searchResults.length} 条结果, query="${message}"`);
      } else {
        console.log(`[Knowledge] 未检索到结果, query="${message}", kbCount=${selectedLibs.length}`);
      }
    }
  }
  
  // Build system prompt
  let systemContent = '';
  const varValues = { ...(conv.variables || {}), ...(variables || {}) };
  
  // Execute plugins BEFORE building system prompt
  const pluginResult = await executePlugins(agent.config.plugins || [], varValues, agent.config);
  
  // Collect plugin data into varValues so prompts can use {{plugin.xxx}} syntax
  for (const r of pluginResult.results) {
    if (r.success) {
      varValues[`plugin.${r.pluginName}`] = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    }
  }
  
  for (const prompt of (agent.config.prompts || [])) {
    if (prompt.role === 'system') {
      let content = prompt.content;
      // Replace variables
      for (const [key, val] of Object.entries(varValues)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), val);
      }
      systemContent += content + '\n';
    }
  }
  
  if (knowledgeContext) {
    systemContent += knowledgeContext;
  }
  
  // Inject plugin execution results into system prompt
  if (pluginResult.context) {
    systemContent += pluginResult.context;
  }
  
  // Build messages for LLM
  const llmMessages = [];
  if (systemContent.trim()) {
    llmMessages.push({ role: 'system', content: systemContent.trim() });
  }
  
  // Add conversation history (last 10 exchanges)
  const historyMessages = conv.messages.filter(m => 
    m.role === 'user' || m.role === 'assistant'
  ).slice(-20);
  
  for (const msg of historyMessages) {
    if (msg.id !== userMsg.id) {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }
  
  // Add current user message with variable substitution
  let userContent = message;
  for (const prompt of (agent.config.prompts || [])) {
    if (prompt.role === 'user' && prompt.content) {
      let templateContent = prompt.content;
      for (const [key, val] of Object.entries(varValues)) {
        templateContent = templateContent.replace(new RegExp(`{{${key}}}`, 'g'), val);
      }
      if (templateContent.includes('{{query}}')) {
        userContent = templateContent.replace('{{query}}', message);
      }
    }
  }
  
  llmMessages.push({ role: 'user', content: userContent });
  
  // Set SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  // Send plugin execution results to frontend
  if (pluginResult.results.length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'plugins', results: pluginResult.results })}\n\n`);
  }
  
  try {
    let assistantContent = '';
    
    if (provider.type === 'ollama') {
      const response = await fetch(`${provider.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.id,
          messages: llmMessages,
          stream: true,
          options: {
            temperature: agent.config.temperature || 0.7,
            top_p: agent.config.topP || 0.9,
            num_predict: agent.config.maxOutput || 2048
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API错误: ${response.status}`);
      }
      
      for await (const chunk of response.body) {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message && data.message.content) {
              assistantContent += data.message.content;
              res.write(`data: ${JSON.stringify({ content: data.message.content, done: false })}\n\n`);
            }
            if (data.done) {
              break;
            }
          } catch (e) {}
        }
      }
    } else {
      // OpenAI / OpenAI-compatible
      const chatPath = provider.chatPath || '/v1/chat/completions';
      const response = await fetch(`${provider.baseUrl}${chatPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({
          model: model.id,
          messages: llmMessages,
          stream: true,
          temperature: agent.config.temperature || 0.7,
          top_p: agent.config.topP || 0.9,
          max_tokens: agent.config.maxOutput || 2048
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API错误: ${response.status} - ${errText}`);
      }
      
      for await (const chunk of response.body) {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (line === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              res.write(`data: ${JSON.stringify({ content: delta, done: false })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }
    
    // Save assistant message
    const assistantMsg = {
      id: uuidv4(),
      role: 'assistant',
      content: assistantContent || '（模型返回为空，请检查模型服务状态）',
      createdAt: new Date().toISOString()
    };
    conv.messages.push(assistantMsg);
    
    // Update conversation title from first user message
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
    }
    
    conv.updatedAt = new Date().toISOString();
    convData.conversations[convIdx] = conv;
    writeJSON(convFile, convData);
    
    // Send done signal with citations
    res.write(`data: ${JSON.stringify({ content: '', done: true, citations: citationSources || [], messageId: assistantMsg.id })}\n\n`);
    res.end();
    
  } catch (err) {
    console.error('LLM call error:', err);
    const errMsg = `调用模型失败: ${err.message}`;
    res.write(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`);
    res.end();
  }
});

// POST /api/conversations/:agentId/generate - 生成型智能体一次性生成
router.post('/:agentId/generate', async (req, res) => {
  const { agentId } = req.params;
  const { variables } = req.body;
  
  const agentsData = readJSON(AGENTS_FILE);
  const agent = (agentsData.agents || []).find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });
  if (agent.type !== 'generate') return res.status(400).json({ error: '不是生成型智能体' });
  
  const modelsData = readJSON(MODELS_FILE);
  const providerId = agent.config.providerId;
  const modelId = agent.config.modelId;
  
  const varValues = variables || {};
  
  // Build prompt
  const llmMessages = [];
  for (const prompt of (agent.config.prompts || [])) {
    let content = prompt.content;
    for (const [key, val] of Object.entries(varValues)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), val);
    }
    if (content.trim()) {
      llmMessages.push({ role: prompt.role, content: content.trim() });
    }
  }
  
  if (!providerId || !modelId) {
    return res.json({ result: '未配置模型服务，请在智能体配置中选择模型' });
  }
  
  const modelCfg = findModelConfig(modelsData, providerId, modelId);
  if (!modelCfg) {
    return res.json({ result: '模型服务不可用或已禁用，请检查模型管理' });
  }
  
  const { provider } = modelCfg;
  const model = modelCfg.model;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  try {
    let result = '';
    
    if (provider.type === 'ollama') {
      const response = await fetch(`${provider.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.id,
          messages: llmMessages,
          stream: true
        })
      });
      
      for await (const chunk of response.body) {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              result += data.message.content;
              res.write(`data: ${JSON.stringify({ content: data.message.content, done: false })}\n\n`);
            }
          } catch (e) {}
        }
      }
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
          messages: llmMessages,
          stream: true,
          max_tokens: agent.config.maxOutput || 2048
        })
      });
      
      for await (const chunk of response.body) {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              result += delta;
              res.write(`data: ${JSON.stringify({ content: delta, done: false })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }
    
    res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
    res.end();
  }
});

// DELETE /api/conversations/:agentId/:convId
router.delete('/:agentId/:convId', (req, res) => {
  const convFile = path.join(CONVERSATIONS_DIR, `${req.params.agentId}.json`);
  if (!fs.existsSync(convFile)) return res.json({ success: true });
  
  const data = readJSON(convFile);
  data.conversations = (data.conversations || []).filter(c => c.id !== req.params.convId);
  writeJSON(convFile, data);
  res.json({ success: true });
});

module.exports = router;
// Returns { context: string, results: [{pluginName, success, data, error}] }
async function executePlugins(pluginIds, varValues, agentConfig) {
  if (!pluginIds || pluginIds.length === 0) return { context: '', results: [] };
  
  const pluginsData = readJSON(PLUGINS_FILE);
  const allPlugins = pluginsData?.plugins || [];
  const results = [];
  
  for (const pluginId of pluginIds) {
    const plugin = allPlugins.find(p => p.id === pluginId && p.status === 'published');
    if (!plugin) continue;
    
    const cfg = plugin.config || {};
    const startTime = Date.now();
    
    try {
      // Substitute variables in URL, headers, body
      let url = cfg.url || '';
      let body = cfg.body || '';
      const headers = { ...(cfg.headers || {}) };
      
      for (const [key, val] of Object.entries(varValues)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        url = url.replace(regex, val || '');
        body = body.replace(regex, val || '');
        for (const hKey of Object.keys(headers)) {
          headers[hKey] = headers[hKey].replace(regex, val || '');
        }
      }
      
      if (!url) {
        results.push({ pluginName: plugin.name, success: false, error: 'URL为空' });
        continue;
      }
      
      const fetchOptions = {
        method: (cfg.method || 'GET').toUpperCase(),
        headers: { 'User-Agent': 'MaiyuWorkshop/1.0' }
      };
      
      // Merge custom headers
      for (const [k, v] of Object.entries(headers)) {
        if (v && v.trim()) fetchOptions.headers[k] = v;
      }
      
      // Add body for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method) && body) {
        // Try to detect if body is JSON; if so set Content-Type
        const trimmedBody = body.trim();
        if (trimmedBody.startsWith('{') || trimmedBody.startsWith('[')) {
          fetchOptions.headers['Content-Type'] = fetchOptions.headers['Content-Type'] || 'application/json';
        }
        fetchOptions.body = trimmedBody;
      }
      
      // Replace params defined in the plugin config into URL
      for (const param of (cfg.params || [])) {
        if (param.name && varValues[param.name]) {
          url = url.replace(new RegExp(`{{${param.name}}}`, 'g'), varValues[param.name]);
        }
      }
      
      const response = await fetch(url, fetchOptions);
      const elapsed = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || '';
      
      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      
      results.push({
        pluginName: plugin.name,
        success: response.ok,
        data,
        statusCode: response.status,
        elapsed
      });
      
      // Track usage
      trackPluginUsage(plugin.id, plugin.name, 'chat', response.ok, elapsed);
    } catch (err) {
      results.push({
        pluginName: plugin.name,
        success: false,
        error: err.message
      });
      trackPluginUsage(plugin.id, plugin.name, 'chat', false, 0, err.message);
    }
  }
  
  // Build context string from plugin results
  let context = '';
  const successfulResults = results.filter(r => r.success);
  if (successfulResults.length > 0) {
    context = '\n\n以下是从插件获取的实时数据，请在回答中参考使用：\n';
    for (const r of successfulResults) {
      const dataStr = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
      // Truncate long results
      const truncated = dataStr.length > 2000 ? dataStr.substring(0, 2000) + '...(已截断)' : dataStr;
      context += `\n[插件: ${r.pluginName}]\n${truncated}\n`;
    }
  }
  
  return { context, results };
}

// Execute workflow and stream result as SSE chat response
async function executeChatWorkflow(agent, message, conv, convFile, convData, convIdx, userMsg, modelCfg, res) {
  const varValues = { ...(conv.variables || {}) };

  // Execute plugins
  const pluginResult = await executePlugins(agent.config.plugins || [], varValues, agent.config);
  for (const r of pluginResult.results) {
    if (r.success) {
      varValues[`plugin.${r.pluginName}`] = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    }
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (pluginResult.results.length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'plugins', results: pluginResult.results })}\n\n`);
  }

  try {
    const wfResult = await executeWorkflow(agent.id, { ...varValues, query: message }, modelCfg);

    if (!wfResult.success) {
      res.write(`data: ${JSON.stringify({ content: `工作流执行失败: ${wfResult.error}`, done: false })}\n\n`);
    } else {
      const reply = wfResult.reply || '';
      if (reply) {
        res.write(`data: ${JSON.stringify({ content: reply, done: false })}\n\n`);
      }
    }

    // Save assistant message
    const assistantContent = wfResult.reply || `[工作流完成] ${JSON.stringify(wfResult.result?._result || '')}`;
    const assistantMsg = {
      id: uuidv4(),
      role: 'assistant',
      content: assistantContent,
      createdAt: new Date().toISOString()
    };
    conv.messages.push(assistantMsg);

    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
    }
    conv.updatedAt = new Date().toISOString();
    convData.conversations[convIdx] = conv;
    writeJSON(convFile, convData);

    res.write(`data: ${JSON.stringify({ content: '', done: true, messageId: assistantMsg.id })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[WorkflowChat] Error:', err);
    res.write(`data: ${JSON.stringify({ error: `工作流执行错误: ${err.message}`, done: true })}\n\n`);
    res.end();
  }
}

module.exports = router;
