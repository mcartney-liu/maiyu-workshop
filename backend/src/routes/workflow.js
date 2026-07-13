const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { AGENTS_FILE, KNOWLEDGE_FILE, MODELS_FILE, PLUGINS_FILE, CONVERSATIONS_DIR, readJSON, writeJSON, findModelConfig } = require('../utils/storage');

const WORKFLOW_FILE = path.join(__dirname, '../../data/workflows.json');
const vm = require('vm');

function readWorkflows() {
  if (!fs.existsSync(WORKFLOW_FILE)) return { workflows: {} };
  return readJSON(WORKFLOW_FILE) || { workflows: {} };
}

function writeWorkflows(data) {
  writeJSON(WORKFLOW_FILE, data);
}

// ========== Helper: Safe condition evaluation ==========
function evaluateCondition(expr, ctx) {
  if (!expr || !expr.trim()) return true;
  let s = expr;
  // Replace {{var}} with actual values
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === 'string') {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), JSON.stringify(v));
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  // Remove any unresolved {{...}} placeholders (treat as false)
  if (/\{\{/.test(s)) return false;
  try {
    // Use Function constructor for safe evaluation — only allow comparison/logic operators
    const result = new Function(`"use strict"; return (${s});`)();
    return Boolean(result);
  } catch (e) {
    console.error('[WKF] Condition eval error:', e.message, '| expr:', s);
    return false;
  }
}

// ========== Helper: Sandboxed code execution ==========
function executeCode(code, language, ctx, timeoutMs) {
  if (!code || !code.trim()) return '';
  const t = timeoutMs || 30000;
  if (language === 'javascript' || language === 'js') {
    try {
      const sandbox = { ...ctx, console: { log: (...args) => { sandbox.__logs = (sandbox.__logs || '') + args.join(' ') + '\\n'; } }, __logs: '', __result: undefined };
      const context = vm.createContext(sandbox);
      const wrapped = `(function() { try { __result = eval(${JSON.stringify(code)}); } catch(e) { __result = 'Error: ' + e.message; } })();`;
      vm.runInContext(wrapped, context, { timeout: t });
      return sandbox.__result !== undefined ? (typeof sandbox.__result === 'object' ? JSON.stringify(sandbox.__result) : String(sandbox.__result)) : (sandbox.__logs || '[代码执行完毕，无返回值]');
    } catch (e) {
      return `[代码执行错误: ${e.message}]`;
    }
  } else if (language === 'python' || language === 'py') {
    try {
      const { execSync } = require('child_process');
      const result = execSync(`python3 -c ${JSON.stringify(code)}`, { timeout: t, encoding: 'utf-8' });
      return result.trim() || '[Python执行完毕，无输出]';
    } catch (e) {
      try {
        const { execSync } = require('child_process');
        const result = execSync(`python -c ${JSON.stringify(code)}`, { timeout: t, encoding: 'utf-8' });
        return result.trim() || '[Python执行完毕，无输出]';
      } catch (e2) {
        return `[Python执行错误: ${e2.message}]`;
      }
    }
  }
  return `[不支持的代码语言: ${language}]`;
}

// ========== Helper: Truncate oversized content ==========
function truncateContent(content, maxLen = 3000) {
  if (!content || content.length <= maxLen) return content;
  const half = Math.floor(maxLen / 2);
  return content.substring(0, half) + '\n\n...(中间内容已省略，共 ' + content.length + ' 字)...\n\n' + content.substring(content.length - half);
}

// ========== Helper: Merge results ==========
function mergeResults(strategy, results, ctx) {
  const arr = (results || []).filter(Boolean);
  if (arr.length === 0) return '';
  switch (strategy) {
    case 'concat': return arr.join('\\n\\n');
    case 'json': return JSON.stringify(arr);
    case 'last': return arr[arr.length - 1];
    case 'first':
    default: return arr[0];
  }
}

// ========== Helper: Classify text via LLM or keyword ==========
async function classifyInput(text, categories, defaultCat, modelCfg) {
  if (!text || !categories || categories.length === 0) return defaultCat || '';
  // Try keyword match first
  const lower = text.toLowerCase();
  for (const cat of categories) {
    const name = (typeof cat === 'string' ? cat : cat.name || cat.label || cat).toLowerCase();
    if (lower.includes(name)) return (typeof cat === 'string' ? cat : cat.name || cat.label || cat);
  }
  if (!modelCfg) return defaultCat || categories[0];
  // Fallback: LLM classification
  try {
    const catNames = categories.map(c => typeof c === 'string' ? c : c.name || c.label || c).join(', ');
    const prompt = `请将以下问题归类到以下类别之一: [${catNames}]。只返回类别名称，不要解释。\n问题: ${text}`;
    const result = await callLLM(modelCfg, prompt, 0.1);
    const trimmed = result.trim();
    for (const c of categories) {
      const cn = typeof c === 'string' ? c : c.name || c.label || c;
      if (trimmed.includes(cn)) return cn;
    }
    return trimmed || defaultCat || categories[0];
  } catch (e) {
    return defaultCat || categories[0];
  }
}

// ========== Helper: Parse document from URL ==========
async function parseDocument(fileUrl, format) {
  if (!fileUrl) return '[错误: 文件URL为空]';
  try {
    const resp = await fetch(fileUrl);
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      return JSON.stringify(await resp.json());
    }
    return await resp.text();
  } catch (e) {
    return `[文档解析错误: ${e.message}]`;
  }
}

// ========== Helper: Send notification via webhook ==========
async function sendNotification(webhook, message, channel, atAll) {
  if (!webhook) return '[错误: webhook地址为空]';
  try {
    let body;
    if (channel === 'wecom') {
      body = JSON.stringify({ msgtype: 'text', text: { content: message, mentioned_list: atAll ? ['@all'] : [] } });
    } else if (channel === 'feishu') {
      body = JSON.stringify({ msg_type: 'text', content: { text: message } });
    } else {
      body = JSON.stringify({ msgtype: 'text', text: { content: message }, at: atAll ? { isAtAll: true } : {} });
    }
    await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return '通知发送成功';
  } catch (e) {
    return `[通知发送失败: ${e.message}]`;
  }
}

// GET /api/workflow/list - 列出所有工作流
router.get('/list', (req, res) => {
  const data = readWorkflows();
  const list = Object.entries(data.workflows).map(([agentId, wf]) => ({
    agentId,
    nodeCount: (wf.nodes || []).length,
    edgeCount: (wf.edges || []).length,
    updatedAt: wf.updatedAt
  }));
  res.json({ workflows: list });
});

// GET /api/workflow/:agentId - 获取指定智能体的工作流
router.get('/:agentId', (req, res) => {
  const data = readWorkflows();
  const wf = data.workflows[req.params.agentId];
  if (!wf) return res.json({ nodes: [], edges: [] });
  res.json(wf);
});

// POST /api/workflow/:agentId - 保存工作流
router.post('/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { nodes, edges } = req.body;

  if (!nodes || !Array.isArray(nodes)) {
    return res.status(400).json({ error: '请提供节点数据' });
  }

  // Verify agent exists
  const agentsData = readJSON(AGENTS_FILE);
  const agent = (agentsData.agents || []).find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });

  const data = readWorkflows();
  data.workflows[agentId] = {
    agentId,
    nodes,
    edges: edges || [],
    updatedAt: new Date().toISOString()
  };
  writeWorkflows(data);

  res.json({ success: true, agentId, nodeCount: nodes.length, edgeCount: (edges || []).length });
});

// DELETE /api/workflow/:agentId - 删除工作流
router.delete('/:agentId', (req, res) => {
  const data = readWorkflows();
  delete data.workflows[req.params.agentId];
  writeWorkflows(data);
  res.json({ success: true });
});

// Internal: execute workflow and return result (for conversations.js)
async function executeWorkflow(agentId, variables, modelCfg) {
  const data = readWorkflows();
  const wf = data.workflows[agentId];
  if (!wf || !wf.nodes || wf.nodes.length === 0) return { success: false, error: '工作流为空' };

  const knowledgeData = readJSON(KNOWLEDGE_FILE);
  const pluginsData = readJSON(PLUGINS_FILE);
  const modelsData = readJSON(MODELS_FILE);

  const nodeMap = {};
  const edgeMap = {};
  for (const n of wf.nodes) nodeMap[n.id] = n;
  for (const e of (wf.edges || [])) {
    if (!edgeMap[e.source]) edgeMap[e.source] = [];
    edgeMap[e.source].push(e.target);
  }

  const startNode = wf.nodes.find(n => n.type === 'start');
  if (!startNode) return { success: false, error: '缺少开始节点' };

  const ctx = { ...(variables || {}), _result: '', _reply: '' };

  // Inject knowledge base context
  const agentsData = readJSON(AGENTS_FILE);
  const agent = (agentsData.agents || []).find(a => a.id === agentId);
  if (agent && agent.config.knowledgeBases && agent.config.knowledgeBases.length > 0) {
    const selectedLibs = (knowledgeData.libraries || []).filter(
      k => agent.config.knowledgeBases.includes(k.id) && k.status === 'published'
    );
    if (selectedLibs.length > 0) {
      try {
        const { vectorSearch } = require('./knowledge');
        const results = await vectorSearch(ctx.query || '', selectedLibs, 5, 0.3);
        if (results.length > 0) {
          ctx.knowledge = results.map((r, i) => `[${i + 1}. ${r.source}] ${r.content}`).join('\n\n');
        }
      } catch (e) { console.log('[WKF] Knowledge search skipped:', e.message); }
    }
  }
  const visited = new Set();
  const queue = [startNode.id];
  let steps = 0, maxSteps = 50;

  while (queue.length > 0 && steps < maxSteps) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeMap[id];
    if (!node) continue;

    try {
      switch (node.type) {
        case 'start': break;
        case 'end':
          if (node.data.resultVar) ctx[node.data.resultVar] = ctx._result;
          break;
        case 'reply':
          let t = node.data.content || ctx._result || '';
          t = t.replace(/\{\{_result\}\}/g, ctx._result || '');
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_'))
              t = t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          ctx._reply = t;
          break;
        case 'llm': {
          // Resolve model: use node's model field if specified, otherwise fallback to agent default
          let nodeModelCfg = modelCfg;
          if (node.data.model && node.data.model.includes('/')) {
            const [pId, mId] = node.data.model.split('/');
            const found = findModelConfig(modelsData, pId, mId);
            if (found) {
              nodeModelCfg = found;
            } else {
              console.log(`[WKF] 节点模型不存在: ${node.data.model}, 使用智能体默认模型`);
            }
          }
          if (!nodeModelCfg) { ctx._result = '[错误: 未配置模型]'; break; }
          let prompt = node.data.prompt || '';
          prompt = prompt.replace(/\{\{_result\}\}/g, ctx._result || '');
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_'))
              prompt = prompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          if (!prompt) prompt = ctx.query || '';
          ctx._result = await callLLM(nodeModelCfg, prompt, node.data.temperature || 0.3);
          break;
        }
        case 'http':
          let url = node.data.url || '';
          const method = (node.data.method || 'GET').toUpperCase();
          let body = node.data.body || '';
          for (const [k, v] of Object.entries(ctx)) {
            const val = typeof v === 'string' ? v : JSON.stringify(v);
            if (!k.startsWith('_')) {
              url = url.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), val);
              body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), val);
            }
          }
          try {
            const opts = { method, headers: { 'User-Agent': 'MaiyuWorkflow/1.0' } };
            if (['POST','PUT','PATCH'].includes(method) && body) {
              opts.body = body; opts.headers['Content-Type'] = 'application/json';
            }
            const resp = await fetch(url, opts);
            ctx._result = await resp.text();
          } catch (e) { ctx._result = `[HTTP错误: ${e.message}]`; }
          break;
        case 'knowledge':
          if (node.data.kbId) {
            const kb = (knowledgeData.libraries || []).find(k => k.id === node.data.kbId);
            if (kb) {
              const docs = (kb.documents || []).slice(0, node.data.topK || 3);
              ctx[node.data.outputVar || 'knowledge'] = docs.map(d => truncateContent(d.content || '')).filter(Boolean).join('\n\n');
            }
          }
          break;
        case 'sqlQuery':
          let sql = node.data.sql || ctx._result || '';
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_'))
              sql = sql.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          sql = sql.replace(/```sql\s*/gi, '').replace(/```\s*/g, '').trim();
          ctx._result = await execSQL(node.data, sql);
          break;
        case 'code':
          let cl = node.data.language || 'javascript';
          let cc = node.data.code || '';
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_'))
              cc = cc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          ctx._result = executeCode(cc, cl, ctx, (node.data.timeout || 30) * 1000);
          break;
        case 'condition':
          ctx._conditionResult = evaluateCondition(node.data.condition, ctx);
          ctx[node.data.outputVar || '_cond'] = ctx._conditionResult;
          break;
        case 'classifier':
          let catText = ctx._result || ctx.query || '';
          let cats = node.data.categories || [];
          if (typeof cats === 'string') { try { cats = JSON.parse(cats); } catch(e) { cats = cats.split(',').map(s => s.trim()); } }
          ctx._classifyResult = await classifyInput(catText, cats, node.data.defaultCategory || '', modelCfg);
          ctx[node.data.outputVar || '_category'] = ctx._classifyResult;
          ctx._result = ctx._classifyResult;
          break;
        case 'merge':
          ctx._result = mergeResults(node.data.strategy || 'first', [ctx._result], ctx);
          break;
        case 'loop':
          let loopCond = node.data.condition || '';
          let maxIter = parseInt(node.data.maxIterations) || 10;
          let iterVar = node.data.iteratorVar || 'item';
          let loopBody = node.data.loopBody || '';
          ctx._loopResults = [];
          for (let i = 0; i < maxIter; i++) {
            ctx[iterVar] = i;
            ctx._loopIndex = i;
            if (loopCond && !evaluateCondition(loopCond, ctx)) break;
            if (loopBody) {
              for (const [k, v] of Object.entries(ctx)) {
                if (typeof v === 'string' && !k.startsWith('_'))
                  loopBody = loopBody.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              }
              ctx._loopResults.push(loopBody);
            }
          }
          ctx._result = ctx._loopResults.join('\n');
          break;
        case 'docParser':
          let fu = node.data.fileUrl || '';
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_'))
              fu = fu.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          ctx._result = await parseDocument(fu, node.data.format || 'auto');
          ctx[node.data.outputVar || '_doc'] = ctx._result;
          break;
        case 'agent':
          if (node.data.agentId && node.data.agentId !== agentId) {
            try {
              let subVars = { query: ctx.query || ctx._result || '' };
              if (node.data.inputMapping) {
                for (const [k, v] of Object.entries(ctx)) {
                  if (typeof v === 'string' && !k.startsWith('_'))
                    subVars[k] = v;
                }
              }
              const subResult = await executeWorkflow(node.data.agentId, subVars, modelCfg);
              ctx._result = subResult.success ? (subResult.reply || '') : `[Agent执行失败: ${subResult.error}]`;
            } catch (e) { ctx._result = `[Agent调用错误: ${e.message}]`; }
          } else {
            ctx._result = '[错误: Agent节点需要指定目标智能体ID]';
          }
          break;
        case 'plugin':
          try {
            let pluginId = node.data.pluginId || '';
            let allPlugins = (pluginsData.plugins || []).concat(pluginsData.mcpServers || []).concat(pluginsData.lightApps || []);
            let found = allPlugins.find(p => p.id === pluginId);
            if (found && found.endpoint) {
              let pUrl = found.endpoint;
              for (const [k, v] of Object.entries(ctx)) {
                if (typeof v === 'string' && !k.startsWith('_'))
                  pUrl = pUrl.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              }
              const presp = await fetch(pUrl);
              ctx._result = await presp.text();
            } else if (found && found.config) {
              ctx._result = `[插件已配置: ${found.name || pluginId}]`;
            } else {
              ctx._result = `[插件不存在或未配置: ${pluginId}]`;
            }
          } catch (e) { ctx._result = `[插件执行错误: ${e.message}]`; }
          break;
        case 'lightApp':
          try {
            let laId = node.data.appId || '';
            let lightApps = (pluginsData.lightApps || []);
            let la = lightApps.find(a => a.id === laId);
            if (la && la.endpoint) {
              let laUrl = la.endpoint;
              for (const [k, v] of Object.entries(ctx)) {
                if (typeof v === 'string' && !k.startsWith('_'))
                  laUrl = laUrl.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              }
              const laResp = await fetch(laUrl);
              ctx._result = await laResp.text();
            } else {
              ctx._result = `[轻应用不存在或未配置: ${laId}]`;
            }
          } catch (e) { ctx._result = `[轻应用错误: ${e.message}]`; }
          break;
        case 'notify':
          let nm = node.data.message || ctx._result || '';
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_'))
              nm = nm.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          ctx._notifyResult = await sendNotification(node.data.webhook || '', nm, node.data.channel || 'dingtalk', node.data.atAll);
          break;
        case 'lightAppQA':
          ctx._result = `[轻应用问答: ${node.data.question || ctx._result || ''}]`;
          break;
        case 'metricsQA':
          let metric = node.data.metric || '';
          let timeRange = node.data.timeRange || '';
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_')) {
              metric = metric.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              timeRange = timeRange.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
          }
          try {
            const businessData = readJSON(path.join(__dirname, '../../data/business.json'));
            ctx._result = JSON.stringify({ metric, timeRange, note: '指标数据需在业务知识中配置', samples: (businessData.samples || []).slice(0, 5) });
          } catch (e) { ctx._result = `[指标错误: ${e.message}]`; }
          break;
        case 'dataQA':
          let dq = node.data.query || ctx._result || ctx.query || '';
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_'))
              dq = dq.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          if (modelCfg) {
            ctx._result = await callLLM(modelCfg, `请基于业务数据回答以下问题: ${dq}`, 0.3);
          } else {
            ctx._result = `[数据问答: ${dq}]`;
          }
          break;
        default: break;
      }
    } catch (err) {
      console.error(`[executeWorkflow] Node ${node.id} error:`, err.message);
      ctx._result = `[节点错误: ${err.message}]`;
    }

    const nextIds = edgeMap[id] || [];
    if (node.type === 'condition') {
      // Follow true/false branch based on condition evaluation
      if (ctx._conditionResult && nextIds.length > 0) {
        queue.push(nextIds[0]); // true branch
      } else if (!ctx._conditionResult && nextIds.length > 1) {
        queue.push(nextIds[1]); // false branch
      } else if (nextIds.length > 0) {
        queue.push(nextIds[0]);
      }
    } else if (node.type === 'classifier' && ctx._classifyResult && nextIds.length > 0) {
      // Route to the matching category edge
      const cats = node.data.categories || [];
      let catIdx = -1;
      if (typeof cats === 'string') { try { cats = JSON.parse(cats); } catch(e) { cats = cats.split(',').map(s => s.trim()); } }
      for (let ci = 0; ci < cats.length; ci++) {
        const cn = typeof cats[ci] === 'string' ? cats[ci] : cats[ci].name || cats[ci].label || cats[ci];
        if (cn === ctx._classifyResult) { catIdx = ci; break; }
      }
      if (catIdx >= 0 && catIdx < nextIds.length) {
        queue.push(nextIds[catIdx]);
      } else if (nextIds.length > 0) {
        queue.push(nextIds[0]);
      }
    } else {
      for (const nid of nextIds) {
        if (!visited.has(nid)) queue.push(nid);
      }
    }
    steps++;
  }

  return { success: true, reply: ctx._reply || ctx._result, result: ctx, steps };
}

// POST /api/workflow/:agentId/execute - 执行工作流
router.post('/:agentId/execute', async (req, res) => {
  const { agentId } = req.params;
  const { variables } = req.body || {};

  const data = readWorkflows();
  const wf = data.workflows[agentId];
  if (!wf || !wf.nodes || wf.nodes.length === 0) {
    return res.status(400).json({ error: '工作流为空，请先编辑工作流' });
  }

  // Load agent for model config
  const agentsData = readJSON(AGENTS_FILE);
  const agent = (agentsData.agents || []).find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: '智能体不存在' });

  const modelsData = readJSON(MODELS_FILE);
  let modelCfg = null;
  if (agent.config.providerId && agent.config.modelId) {
    modelCfg = findModelConfig(modelsData, agent.config.providerId, agent.config.modelId);
  }

  const knowledgeData = readJSON(KNOWLEDGE_FILE);
  const pluginsData = readJSON(PLUGINS_FILE);

  // Build adjacency graph
  const nodeMap = {};
  const edgeMap = {}; // sourceId -> [targetIds]
  for (const n of wf.nodes) nodeMap[n.id] = n;
  for (const e of (wf.edges || [])) {
    if (!edgeMap[e.source]) edgeMap[e.source] = [];
    edgeMap[e.source].push(e.target);
  }

  // Find start node
  const startNode = wf.nodes.find(n => n.type === 'start');
  if (!startNode) return res.status(400).json({ error: '工作流缺少开始节点' });

  // Execution context
  const ctx = { ...(variables || {}), _stepLog: [], _result: '' };
  let currentId = startNode.id;

  // SSE streaming response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(type, data) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  // Get next node(s) from current
  function getNext(currentId) {
    return edgeMap[currentId] || [];
  }

  // Execute a single node
  async function executeNode(node) {
    const startTime = Date.now();
    send('step', { nodeId: node.id, nodeType: node.type, label: node.data.label || node.type, status: 'running' });
    ctx._stepLog.push({ nodeId: node.id, type: node.type, label: node.data.label, time: new Date().toISOString() });

    try {
      switch (node.type) {
        case 'start':
          break;

        case 'end':
          if (node.data.resultVar) {
            ctx[node.data.resultVar] = ctx._result;
          }
          break;

        case 'reply':
          ctx._result = node.data.content || '';
          // Variable substitution — handle {{_result}} specially since _ prefix is normally excluded
          ctx._result = ctx._result.replace(/\{\{_result\}\}/g, ctx._result || '');
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_')) {
              ctx._result = ctx._result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
          }
          send('reply', { content: ctx._result, nodeId: node.id });
          break;

        case 'llm':
          if (!modelCfg) {
            send('step', { nodeId: node.id, status: 'error', error: '未配置模型' });
            ctx._result = '[错误: 未配置模型]';
            break;
          }
          // Build prompt
          let prompt = node.data.prompt || '';
          prompt = prompt.replace(/\{\{_result\}\}/g, ctx._result || '');
          for (const [k, v] of Object.entries(ctx)) {
            if (typeof v === 'string' && !k.startsWith('_')) {
              prompt = prompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
          }
          const llmResult = await callLLM(modelCfg, prompt, agent.config.temperature || 0.7);
          ctx._result = llmResult;
          send('llm', { content: llmResult.substring(0, 200), nodeId: node.id });
          break;

        case 'http':
          let url = node.data.url || '';
          const method = (node.data.method || 'GET').toUpperCase();
          let body = node.data.body || '';
          for (const [k, v] of Object.entries(ctx)) {
            const val = typeof v === 'string' ? v : JSON.stringify(v);
            if (!k.startsWith('_')) {
              url = url.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), val);
              body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), val);
            }
          }
          try {
            const fetchOpts = { method, headers: { 'User-Agent': 'MaiyuWorkflow/1.0' } };
            if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
              fetchOpts.body = body;
              fetchOpts.headers['Content-Type'] = 'application/json';
            }
            const resp = await fetch(url, fetchOpts);
            ctx._result = await resp.text();
            send('step', { nodeId: node.id, status: 'done', elapsed: Date.now() - startTime });
          } catch (e) {
            send('step', { nodeId: node.id, status: 'error', error: e.message });
            ctx._result = `[HTTP错误: ${e.message}]`;
          }
          break;

        case 'knowledge':
          if (node.data.kbId) {
            const kb = (knowledgeData.libraries || []).find(k => k.id === node.data.kbId);
            if (kb) {
              const topK = node.data.topK || 3;
              const docs = (kb.documents || []).slice(0, topK);
              const snippets = docs.map(d => truncateContent(d.content || '')).filter(Boolean);
              ctx[node.data.outputVar || 'knowledge'] = snippets.join('\n\n');
              send('knowledge', { nodeId: node.id, hitCount: snippets.length, outputVar: node.data.outputVar || 'knowledge' });
            }
          }
          break;

        case 'code':
          try {
            let cl = node.data.language || 'javascript';
            let cc = node.data.code || '';
            for (const [k, v] of Object.entries(ctx)) {
              if (typeof v === 'string' && !k.startsWith('_'))
                cc = cc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
            ctx._result = executeCode(cc, cl, ctx, (node.data.timeout || 30) * 1000);
            send('step', { nodeId: node.id, status: 'done', message: '代码执行完成' });
          } catch (e) {
            send('step', { nodeId: node.id, status: 'error', error: e.message });
            ctx._result = `[代码执行错误: ${e.message}]`;
          }
          break;

        case 'condition':
          ctx._conditionResult = evaluateCondition(node.data.condition, ctx);
          ctx[node.data.outputVar || '_cond'] = ctx._conditionResult;
          send('step', { nodeId: node.id, status: 'done', result: ctx._conditionResult, message: `条件判断: ${ctx._conditionResult}` });
          break;

        case 'classifier':
          try {
            let catText = ctx._result || ctx.query || '';
            let cats = node.data.categories || [];
            if (typeof cats === 'string') { try { cats = JSON.parse(cats); } catch(e) { cats = cats.split(',').map(s => s.trim()); } }
            ctx._classifyResult = await classifyInput(catText, cats, node.data.defaultCategory || '', modelCfg);
            ctx[node.data.outputVar || '_category'] = ctx._classifyResult;
            ctx._result = ctx._classifyResult;
            send('step', { nodeId: node.id, status: 'done', message: `分类结果: ${ctx._classifyResult}` });
          } catch (e) {
            send('step', { nodeId: node.id, status: 'error', error: e.message });
          }
          break;

        case 'merge':
          ctx._result = mergeResults(node.data.strategy || 'first', [ctx._result], ctx);
          send('step', { nodeId: node.id, status: 'done', message: `合并策略: ${node.data.strategy || 'first'}` });
          break;

        case 'loop':
          try {
            let loopCond = node.data.condition || '';
            let maxIter = parseInt(node.data.maxIterations) || 10;
            let iterVar = node.data.iteratorVar || 'item';
            ctx._loopResults = [];
            for (let i = 0; i < maxIter; i++) {
              ctx[iterVar] = i;
              ctx._loopIndex = i;
              if (loopCond && !evaluateCondition(loopCond, ctx)) break;
              let lb = node.data.loopBody || ctx._result || '';
              for (const [k, v] of Object.entries(ctx)) {
                if (typeof v === 'string' && !k.startsWith('_'))
                  lb = lb.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              }
              ctx._loopResults.push(lb);
              send('step', { nodeId: node.id, status: 'running', message: `循环迭代 ${i + 1}/${maxIter}` });
            }
            ctx._result = ctx._loopResults.join('\n');
            send('step', { nodeId: node.id, status: 'done', message: `循环完成，共 ${ctx._loopResults.length} 次迭代` });
          } catch (e) {
            send('step', { nodeId: node.id, status: 'error', error: e.message });
          }
          break;

        case 'docParser':
          try {
            let fu = node.data.fileUrl || '';
            for (const [k, v] of Object.entries(ctx)) {
              if (typeof v === 'string' && !k.startsWith('_'))
                fu = fu.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
            const parsed = await parseDocument(fu, node.data.format || 'auto');
            ctx._result = parsed;
            ctx[node.data.outputVar || '_doc'] = parsed;
            send('step', { nodeId: node.id, status: 'done', message: `文档解析完成，长度: ${parsed.length}` });
          } catch (e) {
            send('step', { nodeId: node.id, status: 'error', error: e.message });
          }
          break;

        case 'agent':
          try {
            if (node.data.agentId && node.data.agentId !== agentId) {
              let subVars = { query: ctx.query || ctx._result || '' };
              if (node.data.inputMapping) {
                for (const [k, v] of Object.entries(ctx)) {
                  if (typeof v === 'string' && !k.startsWith('_')) subVars[k] = v;
                }
              }
              send('step', { nodeId: node.id, status: 'running', message: `调用Agent: ${node.data.agentId}` });
              const subResult = await executeWorkflow(node.data.agentId, subVars, modelCfg);
              ctx._result = subResult.success ? (subResult.reply || '') : `[Agent执行失败: ${subResult.error}]`;
              send('step', { nodeId: node.id, status: 'done', message: 'Agent调用完成' });
            } else {
              ctx._result = '[错误: Agent节点需要指定目标智能体ID]';
              send('step', { nodeId: node.id, status: 'error', error: '未指定目标智能体' });
            }
          } catch (e) {
            send('step', { nodeId: node.id, status: 'error', error: e.message });
            ctx._result = `[Agent调用错误: ${e.message}]`;
          }
          break;

        case 'plugin':
          try {
            let pluginId = node.data.pluginId || '';
            let allPlugs = (pluginsData.plugins || []).concat(pluginsData.mcpServers || []).concat(pluginsData.lightApps || []);
            let found = allPlugs.find(p => p.id === pluginId);
            if (found && found.endpoint) {
              let pUrl = found.endpoint;
              for (const [k, v] of Object.entries(ctx)) {
                if (typeof v === 'string' && !k.startsWith('_'))
                  pUrl = pUrl.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              }
              const presp = await fetch(pUrl);
              ctx._result = await presp.text();
              send('step', { nodeId: node.id, status: 'done', message: '插件调用完成' });
            } else if (found && found.config) {
              ctx._result = `[插件已配置: ${found.name || pluginId}]`;
              send('step', { nodeId: node.id, status: 'done', message: `插件已加载: ${found.name || pluginId}` });
            } else {
              ctx._result = `[插件不存在或未配置: ${pluginId}]`;
              send('step', { nodeId: node.id, status: 'error', error: `插件不存在: ${pluginId}` });
            }
          } catch (e) { send('step', { nodeId: node.id, status: 'error', error: e.message }); }
          break;

        case 'lightApp':
          try {
            let laId = node.data.appId || '';
            let lightApps = (pluginsData.lightApps || []);
            let la = lightApps.find(a => a.id === laId);
            if (la && la.endpoint) {
              let laUrl = la.endpoint;
              for (const [k, v] of Object.entries(ctx)) {
                if (typeof v === 'string' && !k.startsWith('_'))
                  laUrl = laUrl.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              }
              const laResp = await fetch(laUrl);
              ctx._result = await laResp.text();
              send('step', { nodeId: node.id, status: 'done', message: '轻应用调用完成' });
            } else {
              ctx._result = `[轻应用不存在或未配置: ${laId}]`;
              send('step', { nodeId: node.id, status: 'error', error: `轻应用不存在: ${laId}` });
            }
          } catch (e) { send('step', { nodeId: node.id, status: 'error', error: e.message }); }
          break;

        case 'notify':
          try {
            let nm = node.data.message || ctx._result || '';
            for (const [k, v] of Object.entries(ctx)) {
              if (typeof v === 'string' && !k.startsWith('_'))
                nm = nm.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
            ctx._notifyResult = await sendNotification(node.data.webhook || '', nm, node.data.channel || 'dingtalk', node.data.atAll);
            send('step', { nodeId: node.id, status: 'done', message: ctx._notifyResult });
          } catch (e) { send('step', { nodeId: node.id, status: 'error', error: e.message }); }
          break;

        case 'lightAppQA':
          ctx._result = `[轻应用问答: ${node.data.question || ctx._result || ''}]`;
          send('step', { nodeId: node.id, status: 'done', message: '轻应用问答已处理' });
          break;

        case 'metricsQA':
          try {
            let metric = node.data.metric || '';
            let timeRange = node.data.timeRange || '';
            for (const [k, v] of Object.entries(ctx)) {
              if (typeof v === 'string' && !k.startsWith('_')) {
                metric = metric.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
                timeRange = timeRange.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
              }
            }
            const bizData = readJSON(path.join(__dirname, '../../data/business.json'));
            ctx._result = JSON.stringify({ metric, timeRange, note: '指标数据需在业务知识中配置', samples: (bizData.samples || []).slice(0, 5) });
            send('step', { nodeId: node.id, status: 'done', message: `指标查询: ${metric}` });
          } catch (e) { send('step', { nodeId: node.id, status: 'error', error: e.message }); }
          break;

        case 'dataQA':
          try {
            let dq = node.data.query || ctx._result || ctx.query || '';
            for (const [k, v] of Object.entries(ctx)) {
              if (typeof v === 'string' && !k.startsWith('_'))
                dq = dq.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
            if (modelCfg) {
              send('step', { nodeId: node.id, status: 'running', message: '调用LLM进行数据问答...' });
              ctx._result = await callLLM(modelCfg, `请基于业务数据回答以下问题: ${dq}`, 0.3);
            } else {
              ctx._result = `[数据问答: ${dq}]`;
            }
            send('step', { nodeId: node.id, status: 'done', message: '数据问答完成' });
          } catch (e) { send('step', { nodeId: node.id, status: 'error', error: e.message }); }
          break;

        default:
          send('step', { nodeId: node.id, status: 'done', message: `节点类型 ${node.type} 已跳过` });
      }
    } catch (err) {
      send('step', { nodeId: node.id, status: 'error', error: err.message });
    }

    return getNext(node.id);
  }

  // BFS traversal
  try {
    const visited = new Set();
    const queue = [currentId];
    const maxSteps = 50;
    let steps = 0;

    while (queue.length > 0 && steps < maxSteps) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodeMap[id];
      if (!node) continue;

      const nextIds = await executeNode(node);
      steps++;

      // Route based on node type
      if (node.type === 'condition') {
        // Follow true/false branch based on condition evaluation
        if (ctx._conditionResult && nextIds.length > 0) {
          queue.push(nextIds[0]); // true branch
        } else if (!ctx._conditionResult && nextIds.length > 1) {
          queue.push(nextIds[1]); // false branch
        } else if (nextIds.length > 0) {
          queue.push(nextIds[0]);
        }
      } else if (node.type === 'classifier' && ctx._classifyResult && nextIds.length > 0) {
        // Route to the matching category edge
        let cats = node.data.categories || [];
        if (typeof cats === 'string') { try { cats = JSON.parse(cats); } catch(e) { cats = cats.split(',').map(s => s.trim()); } }
        let catIdx = -1;
        for (let ci = 0; ci < cats.length; ci++) {
          const cn = typeof cats[ci] === 'string' ? cats[ci] : cats[ci].name || cats[ci].label || cats[ci];
          if (cn === ctx._classifyResult) { catIdx = ci; break; }
        }
        if (catIdx >= 0 && catIdx < nextIds.length) {
          queue.push(nextIds[catIdx]);
        } else if (nextIds.length > 0) {
          queue.push(nextIds[0]);
        }
      } else {
        for (const nid of nextIds) {
          if (!visited.has(nid)) queue.push(nid);
        }
      }
    }

    send('done', { result: ctx._result, steps: ctx._stepLog, success: true });
  } catch (err) {
    send('done', { error: err.message, success: false });
  }

  res.end();
});

// Helper: call LLM (with 90s timeout)
async function callLLM(modelCfg, prompt, temperature) {
  const { provider, model } = modelCfg;
  // Truncate oversized prompts to avoid timeout
  const MAX_PROMPT_LEN = 12000;
  const truncatedPrompt = prompt.length > MAX_PROMPT_LEN
    ? prompt.substring(0, MAX_PROMPT_LEN) + '\n\n...(内容过长已截断)'
    : prompt;
  const messages = [
    { role: 'system', content: '你是一个工作流中的LLM节点，请根据提示词生成回复。只输出回复内容，不要额外说明。' },
    { role: 'user', content: truncatedPrompt }
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

  try {
    if (provider.type === 'ollama') {
      const response = await fetch(`${provider.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.id, messages, stream: false, options: { temperature } }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      return data.message?.content || '[空回复]';
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
          temperature,
          max_tokens: 2048
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '[空回复]';
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return '[错误: LLM请求超时(90秒)，请简化问题或减少知识库内容后重试]';
    }
    return `[LLM调用失败: ${err.message}]`;
  }
}

// Helper: execute SQL query
async function execSQL(nodeData, sql) {
  if (!sql) return '[错误: SQL为空]';
  const dbType = nodeData.dbType || 'mysql';
  const host = nodeData.host || 'localhost';
  const port = nodeData.port || (dbType === 'postgresql' ? 5432 : 3306);
  const user = nodeData.user || 'root';
  const password = nodeData.password || '';
  const database = nodeData.database || '';
  const timeout = (nodeData.timeout || 30) * 1000;

  try {
    if (dbType === 'postgresql') {
      try { require.resolve('pg'); } catch (e) { return '[错误: pg驱动未安装，请执行 npm install pg]'; }
      const { Pool } = require('pg');
      const pool = new Pool({ host, port, user, password, database, connectionTimeoutMillis: timeout, query_timeout: timeout });
      const result = await pool.query(sql);
      await pool.end();
      return JSON.stringify(result.rows || []);
    } else {
      try { require.resolve('mysql2'); } catch (e) { return '[错误: mysql2驱动未安装，请执行 npm install mysql2]'; }
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({ host, port, user, password, database, connectTimeout: timeout });
      const [rows] = await conn.execute(sql);
      await conn.end();
      return JSON.stringify(rows);
    }
  } catch (err) {
    return `[SQL错误: ${err.message}]`;
  }
}

module.exports = router;
// Export internal execution function for use by conversations
module.exports.executeWorkflow = executeWorkflow;
