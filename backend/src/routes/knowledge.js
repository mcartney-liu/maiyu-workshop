const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const { KNOWLEDGE_FILE, MODELS_FILE, readJSON, writeJSON } = require('../utils/storage');

// Ollama embedding config
const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';

let _embeddingAvailable = null; // memoize

async function checkEmbeddingAvailable() {
  if (_embeddingAvailable !== null) return _embeddingAvailable;
  try {
    const resp = await fetch(`${EMBEDDING_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: 'test' }),
      signal: AbortSignal.timeout(5000)
    });
    _embeddingAvailable = resp.ok;
    return _embeddingAvailable;
  } catch {
    _embeddingAvailable = false;
    return false;
  }
}

async function embedText(text, retries = 2) {
  if (!text || text.trim().length < 2) return null;
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(`${EMBEDDING_BASE}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text.trim() }),
        signal: AbortSignal.timeout(15000)
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.embedding && Array.isArray(data.embedding)) {
        return data.embedding;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function vectorSearch(query, libraries, topK = 5, minScore = 0.3) {
  // Quick embedding — fall back to keyword if Ollama unavailable or slow
  let queryEmb = null;
  const embAvailable = await checkEmbeddingAvailable();
  if (embAvailable) {
    queryEmb = await Promise.race([
      embedText(query),
      new Promise(r => setTimeout(() => r(null), 3000)) // 3s timeout
    ]);
  }
  const results = [];

  for (const lib of libraries) {
    if (lib.status !== 'published') continue;
    for (const doc of lib.documents) {
      // Search FAQ items if present (regardless of doc type)
      if (doc.metadata?.faqs && doc.metadata.faqs.length > 0) {
        for (const item of doc.metadata.faqs) {
          const fullText = item.question + ' ' + item.answer;
          let score;
          if (queryEmb && item.embedding && Array.isArray(item.embedding)) {
            score = cosineSimilarity(queryEmb, item.embedding);
          } else {
            score = keywordScore(query, fullText);
          }
          if (score >= minScore) {
            results.push({
              docId: doc.id, docName: doc.name, type: 'faq',
              content: `Q: ${item.question}\nA: ${item.answer}`,
              score: Math.min(score, 0.99),
              source: doc.name
            });
          }
        }
      }
      // Always search segments too (documents may have both FAQ and text content)
      for (const seg of (doc.segments || [])) {
        let score;
        if (queryEmb && seg.embedding && Array.isArray(seg.embedding)) {
          score = cosineSimilarity(queryEmb, seg.embedding);
        } else {
          score = keywordScore(query, seg.content);
        }
        if (score >= minScore) {
          results.push({
            docId: doc.id, docName: doc.name, type: 'text',
            content: seg.content, score: Math.min(score, 0.99),
            source: doc.name, segId: seg.id
          });
        }
      }
    }

    // === Graph knowledge search ===
    if (lib.type === 'graph' && lib.graphData) {
      const graph = lib.graphData;
      const entities = (graph.entities || []);
      const relations = (graph.relations || []);

      // Build entity index for quick lookup
      const entityMap = {};
      for (const ent of entities) {
        entityMap[ent.id] = ent;
      }

      // 1. Search entities
      for (const ent of entities) {
        const searchText = [ent.name, ent.type, ent.description || ''].filter(Boolean).join(' ');
        let score;
        if (queryEmb && ent.embedding && Array.isArray(ent.embedding)) {
          score = cosineSimilarity(queryEmb, ent.embedding);
        } else {
          score = keywordScore(query, searchText);
        }
        if (score >= minScore) {
          // Find related relations for this entity
          const related = relations.filter(
            r => r.sourceId === ent.id || r.targetId === ent.id
          );
          const relatedText = related.map(r => {
            const otherId = r.sourceId === ent.id ? r.targetId : r.sourceId;
            const otherEnt = entityMap[otherId];
            const otherName = otherEnt ? otherEnt.name : (r.sourceId === ent.id ? r.targetName : r.sourceName);
            return `${r.type}→${otherName}`;
          }).join('; ');

          let content = `【图谱实体】${ent.name}`;
          if (ent.type) content += ` (类型: ${ent.type})`;
          if (ent.description) content += `\n描述: ${ent.description}`;
          if (relatedText) content += `\n关联: ${relatedText}`;
          if (ent.properties && Object.keys(ent.properties).length > 0) {
            content += `\n属性: ${JSON.stringify(ent.properties)}`;
          }

          results.push({
            docId: ent.id, docName: lib.name, type: 'graph_entity',
            content, score: Math.min(score, 0.99),
            source: lib.name, entityId: ent.id
          });
        }
      }

      // 2. Search relations
      for (const rel of relations) {
        const searchText = [rel.sourceName, rel.targetName, rel.type, rel.description || ''].filter(Boolean).join(' ');
        let score;
        if (queryEmb && rel.embedding && Array.isArray(rel.embedding)) {
          score = cosineSimilarity(queryEmb, rel.embedding);
        } else {
          score = keywordScore(query, searchText);
        }
        if (score >= minScore) {
          const srcEnt = entityMap[rel.sourceId];
          const tgtEnt = entityMap[rel.targetId];
          let content = `【图谱关系】${rel.sourceName} → ${rel.type} → ${rel.targetName}`;
          if (rel.description) content += `\n描述: ${rel.description}`;
          if (srcEnt?.description) content += `\n[${rel.sourceName}]: ${srcEnt.description}`;
          if (tgtEnt?.description) content += `\n[${rel.targetName}]: ${tgtEnt.description}`;

          results.push({
            docId: rel.id, docName: lib.name, type: 'graph_relation',
            content, score: Math.min(score, 0.99),
            source: lib.name, relationId: rel.id
          });
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

function keywordScore(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Exact match
  if (t.includes(q)) return 0.85;
  // Substring overlap: split query into 2-char windows and check coverage
  if (/[\u4e00-\u9fff]/.test(q)) {
    // Chinese: use character bigrams + single-char matching
    const bigrams = [];
    for (let i = 0; i < q.length - 1; i++) {
      const ch = q.substring(i, i + 2);
      if (/[\u4e00-\u9fff]/.test(ch)) bigrams.push(ch);
    }
    if (bigrams.length > 0) {
      const matched = bigrams.filter(b => t.includes(b)).length;
      return (matched / bigrams.length) * 0.7;
    }
    // Fallback: single char match for short Chinese queries
    const chars = [...q].filter(c => /[\u4e00-\u9fff]/.test(c));
    if (chars.length > 0) {
      const matched = chars.filter(c => t.includes(c)).length;
      return (matched / chars.length) * 0.4;
    }
  }
  // English: space-separated word matching
  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  if (qWords.length === 0) return 0;
  const matched = qWords.filter(w => t.includes(w)).length;
  return (matched / qWords.length) * 0.5;
}

// GET /api/knowledge - 获取所有知识库
router.get('/', (req, res) => {
  const { status, type, keyword } = req.query;
  const data = readJSON(KNOWLEDGE_FILE);
  let libraries = data.libraries || [];
  
  if (status) libraries = libraries.filter(k => k.status === status);
  if (type) libraries = libraries.filter(k => k.type === type);
  if (keyword) libraries = libraries.filter(k => k.name.includes(keyword));
  
  res.json({ libraries });
});

// GET /api/knowledge/embedding-status - check if Ollama embedding is available
router.get('/embedding-status', async (req, res) => {
  const available = await checkEmbeddingAvailable();
  res.json({ available, model: EMBEDDING_MODEL });
});

// POST /api/knowledge - 创建知识库
router.post('/', (req, res) => {
  const { name, description, type } = req.body;
  
  if (!name) return res.status(400).json({ error: '知识库名称不能为空' });
  if (!type) return res.status(400).json({ error: '请选择知识库类型' });
  
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  
  if (libraries.some(k => k.name === name)) {
    return res.status(400).json({ error: '知识库名称已存在' });
  }
  
  const newLib = {
    id: uuidv4(),
    name,
    description: description || '',
    type,
    status: 'draft',
    documents: [],
    config: {
      searchMode: 'vector',
      topK: 5,
      confidence: 0.3,
      maxTokens: 2000
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  libraries.push(newLib);
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json(newLib);
});

// GET /api/knowledge/:id - 获取单个知识库
router.get('/:id', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const lib = (data.libraries || []).find(k => k.id === req.params.id);
  if (!lib) return res.status(404).json({ error: '知识库不存在' });
  // Strip embeddings from response (too large)
  const cleanLib = JSON.parse(JSON.stringify(lib));
  cleanLib.documents = cleanLib.documents.map(d => ({
    ...d,
    segments: (d.segments || []).map(s => ({ id: s.id, content: s.content.substring(0, 200), index: s.index }))
  }));
  res.json(cleanLib);
});

// PUT /api/knowledge/:id - 更新知识库配置
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const idx = libraries.findIndex(k => k.id === id);
  
  if (idx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  libraries[idx] = {
    ...libraries[idx],
    ...req.body,
    id,
    updatedAt: new Date().toISOString()
  };
  
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json(libraries[idx]);
});

// POST /api/knowledge/:id/documents - 添加文档（自动向量化）
router.post('/:id/documents', async (req, res) => {
  const { name, content, type, metadata } = req.body;
  
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  const lib = libraries[libIdx];
  
  if (lib.documents.some(d => d.name === name)) {
    return res.status(400).json({ error: '文件名已存在，请修改文件名后重试' });
  }
  
  const doc = {
    id: uuidv4(),
    name,
    content: content || '',
    type: type || 'text',
    status: 'parsing',
    metadata: metadata || {},
    segments: [],
    createdAt: new Date().toISOString()
  };

  // Handle FAQ type
  if (type === 'faq') {
    doc.type = 'faq';
    if (metadata?.faqs && Array.isArray(metadata.faqs)) {
      const canEmbed = await checkEmbeddingAvailable();
      for (const faq of metadata.faqs) {
        const combined = (faq.question || '') + ' ' + (faq.answer || '');
        let embedding = null;
        if (canEmbed) {
          embedding = await embedText(combined);
        }
        metadata.faqs = metadata.faqs.map(f => {
          if (f.question === faq.question) return { ...f, embedding };
          return f;
        });
      }
      doc.metadata = metadata;
    }
    doc.status = 'parsed';
  } else {
    // Text document: segment and embed
    if (content) {
      // Smart segmentation: split by double newlines, then merge short ones
      let paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 10);
      // Merge segments smaller than 50 chars with next
      const merged = [];
      let buffer = '';
      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (buffer && buffer.length + trimmed.length < 500) {
          buffer += '\n\n' + trimmed;
        } else {
          if (buffer) merged.push(buffer);
          buffer = trimmed;
        }
      }
      if (buffer) merged.push(buffer);
      
      const canEmbed = await checkEmbeddingAvailable();
      for (let i = 0; i < merged.length; i++) {
        const segContent = merged[i];
        let embedding = null;
        if (canEmbed && segContent.length > 20) {
          embedding = await embedText(segContent);
        }
        doc.segments.push({
          id: `${doc.id}_seg_${i}`,
          content: segContent,
          index: i,
          embedding
        });
      }
    }
    doc.status = 'parsed';
  }

  lib.documents.push(doc);
  libraries[libIdx] = lib;
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  
  // Return doc without embeddings
  const cleanDoc = { ...doc };
  if (cleanDoc.segments) {
    cleanDoc.segments = cleanDoc.segments.map(s => ({ id: s.id, content: s.content.substring(0, 200), index: s.index }));
  }
  res.json(cleanDoc);
});

// DELETE /api/knowledge/:id/documents/:docId - 删除文档
router.delete('/:id/documents/:docId', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  libraries[libIdx].documents = libraries[libIdx].documents.filter(
    d => d.id !== req.params.docId
  );
  
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ success: true });
});

// POST /api/knowledge/:id/re-embed - 重新向量化所有文档
router.post('/:id/re-embed', async (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  const available = await checkEmbeddingAvailable();
  if (!available) {
    return res.status(400).json({ error: `Ollama embedding模型 '${EMBEDDING_MODEL}' 不可用，请先运行: ollama pull ${EMBEDDING_MODEL}` });
  }
  
  let count = 0;
  for (const doc of libraries[libIdx].documents) {
    if (doc.type === 'faq' && doc.metadata?.faqs) {
      for (const faq of doc.metadata.faqs) {
        const combined = (faq.question || '') + ' ' + (faq.answer || '');
        const emb = await embedText(combined);
        if (emb) {
          faq.embedding = emb;
          count++;
        }
      }
    } else {
      for (const seg of (doc.segments || [])) {
        if (seg.content.length > 20) {
          const emb = await embedText(seg.content);
          if (emb) {
            seg.embedding = emb;
            count++;
          }
        }
      }
    }
  }
  
  libraries[libIdx].updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ success: true, embedded: count });
});

// POST /api/knowledge/:id/publish - 发布知识库
router.post('/:id/publish', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const idx = libraries.findIndex(k => k.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  if (libraries[idx].documents.length === 0) {
    return res.status(400).json({ error: '知识库中没有文档，无法发布' });
  }
  
  libraries[idx].status = 'published';
  libraries[idx].updatedAt = new Date().toISOString();
  
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json(libraries[idx]);
});

// POST /api/knowledge/:id/unpublish - 下线知识库
router.post('/:id/unpublish', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const idx = libraries.findIndex(k => k.id === req.params.id);
  
  if (idx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  libraries[idx].status = 'draft';
  libraries[idx].updatedAt = new Date().toISOString();
  
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json(libraries[idx]);
});

// POST /api/knowledge/:id/hit-test - 命中测试（向量检索优先）
router.post('/:id/hit-test', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: '请输入测试问题' });
  
  const data = readJSON(KNOWLEDGE_FILE);
  const lib = (data.libraries || []).find(k => k.id === req.params.id);
  
  if (!lib) return res.status(404).json({ error: '知识库不存在' });
  
  const results = await vectorSearch(query, [lib], 10, 0.1);
  
  res.json({
    results: results.map(r => ({
      docId: r.docId,
      docName: r.docName,
      type: r.type,
      content: r.content.substring(0, 400),
      score: r.score.toFixed(3)
    })),
    query,
    method: (results.length > 0 && (results[0].segId || results[0].entityId || results[0].relationId)) ? 'vector' : 'keyword'
  });
});

// DELETE /api/knowledge/:id - 删除知识库
router.delete('/:id', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  data.libraries = (data.libraries || []).filter(k => k.id !== req.params.id);
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ success: true });
});

// ========================
// Phase 8: 高级知识库功能
// ========================

// PUT /api/knowledge/:id/config - 更新知识库配置（结构化索引、图知识库配置等）
router.put('/:id/config', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const idx = libraries.findIndex(k => k.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  libraries[idx].config = { ...libraries[idx].config, ...req.body };
  libraries[idx].updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json(libraries[idx]);
});

// ----- FAQ 管理 -----

// POST /api/knowledge/:id/documents/:docId/faqs - 批量添加FAQ问答对
router.post('/:id/documents/:docId/faqs', async (req, res) => {
  const { faqs } = req.body;
  if (!faqs || !Array.isArray(faqs) || faqs.length === 0) {
    return res.status(400).json({ error: '请提供FAQ列表' });
  }
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  const docIdx = libraries[libIdx].documents.findIndex(d => d.id === req.params.docId);
  if (docIdx === -1) return res.status(404).json({ error: '文档不存在' });
  
  const doc = libraries[libIdx].documents[docIdx];
  if (!doc.metadata) doc.metadata = {};
  if (!doc.metadata.faqs) doc.metadata.faqs = [];
  if (!doc.metadata.tags) doc.metadata.tags = [];
  if (!doc.metadata.relatedKnowledge) doc.metadata.relatedKnowledge = [];
  
  const canEmbed = await checkEmbeddingAvailable();
  const added = [];
  for (const item of faqs) {
    if (!item.question || !item.answer) continue;
    const newFaq = {
      id: uuidv4(),
      question: item.question,
      answer: item.answer,
      tags: item.tags || [],
      relatedKnowledge: item.relatedKnowledge || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (canEmbed) {
      const combined = item.question + ' ' + item.answer;
      newFaq.embedding = await embedText(combined);
    }
    doc.metadata.faqs.push(newFaq);
    added.push(newFaq);
  }
  doc.updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ added, total: doc.metadata.faqs.length });
});

// PUT /api/knowledge/:id/documents/:docId/faqs/:faqId - 更新单个FAQ
router.put('/:id/documents/:docId/faqs/:faqId', async (req, res) => {
  const { question, answer, tags, relatedKnowledge } = req.body;
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  const docIdx = libraries[libIdx].documents.findIndex(d => d.id === req.params.docId);
  if (docIdx === -1) return res.status(404).json({ error: '文档不存在' });
  
  const doc = libraries[libIdx].documents[docIdx];
  const faqs = doc.metadata?.faqs || [];
  const faqIdx = faqs.findIndex(f => f.id === req.params.faqId);
  if (faqIdx === -1) return res.status(404).json({ error: 'FAQ不存在' });
  
  if (question !== undefined) faqs[faqIdx].question = question;
  if (answer !== undefined) faqs[faqIdx].answer = answer;
  if (tags !== undefined) faqs[faqIdx].tags = tags;
  if (relatedKnowledge !== undefined) faqs[faqIdx].relatedKnowledge = relatedKnowledge;
  faqs[faqIdx].updatedAt = new Date().toISOString();
  
  // Re-embed if content changed
  if (question !== undefined || answer !== undefined) {
    const canEmbed = await checkEmbeddingAvailable();
    if (canEmbed) {
      const combined = faqs[faqIdx].question + ' ' + faqs[faqIdx].answer;
      faqs[faqIdx].embedding = await embedText(combined);
    }
  }
  
  doc.updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json(faqs[faqIdx]);
});

// DELETE /api/knowledge/:id/documents/:docId/faqs/:faqId - 删除单个FAQ
router.delete('/:id/documents/:docId/faqs/:faqId', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  const docIdx = libraries[libIdx].documents.findIndex(d => d.id === req.params.docId);
  if (docIdx === -1) return res.status(404).json({ error: '文档不存在' });
  
  const doc = libraries[libIdx].documents[docIdx];
  if (!doc.metadata) doc.metadata = {};
  doc.metadata.faqs = (doc.metadata.faqs || []).filter(f => f.id !== req.params.faqId);
  doc.updatedAt = new Date().toISOString();
  
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ success: true, total: doc.metadata.faqs.length });
});

// ----- 图知识库管理 -----

// POST /api/knowledge/:id/graph/entities - 添加/更新实体
router.post('/:id/graph/entities', (req, res) => {
  const { entities } = req.body;
  if (!entities || !Array.isArray(entities)) {
    return res.status(400).json({ error: '请提供实体列表' });
  }
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  if (!libraries[libIdx].graphData) {
    libraries[libIdx].graphData = { entities: [], relations: [] };
  }
  const gd = libraries[libIdx].graphData;
  const added = [];
  for (const ent of entities) {
    if (!ent.name || !ent.type) continue;
    const existing = gd.entities.findIndex(e => e.name === ent.name);
    const newEnt = {
      id: uuidv4(),
      name: ent.name,
      type: ent.type,
      description: ent.description || '',
      properties: ent.properties || {},
      createdAt: new Date().toISOString()
    };
    if (existing >= 0) {
      gd.entities[existing] = { ...gd.entities[existing], ...newEnt, id: gd.entities[existing].id };
    } else {
      gd.entities.push(newEnt);
    }
    added.push(newEnt);
  }
  libraries[libIdx].updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ added, total: gd.entities.length });
});

// DELETE /api/knowledge/:id/graph/entities/:entityId - 删除实体
router.delete('/:id/graph/entities/:entityId', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  const gd = libraries[libIdx].graphData || { entities: [], relations: [] };
  gd.entities = gd.entities.filter(e => e.id !== req.params.entityId);
  gd.relations = gd.relations.filter(r => r.sourceId !== req.params.entityId && r.targetId !== req.params.entityId);
  libraries[libIdx].updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ success: true, entities: gd.entities.length, relations: gd.relations.length });
});

// POST /api/knowledge/:id/graph/relations - 添加关系
router.post('/:id/graph/relations', (req, res) => {
  const { relations } = req.body;
  if (!relations || !Array.isArray(relations)) {
    return res.status(400).json({ error: '请提供关系列表' });
  }
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  if (!libraries[libIdx].graphData) {
    libraries[libIdx].graphData = { entities: [], relations: [] };
  }
  const gd = libraries[libIdx].graphData;
  const added = [];
  for (const rel of relations) {
    const sourceExists = gd.entities.find(e => e.id === rel.sourceId || e.name === rel.sourceName);
    const targetExists = gd.entities.find(e => e.id === rel.targetId || e.name === rel.targetName);
    const sourceId = sourceExists?.id || rel.sourceId;
    const targetId = targetExists?.id || rel.targetId;
    if (!sourceId || !targetId || !rel.type) continue;
    
    const newRel = {
      id: uuidv4(),
      sourceId,
      targetId,
      sourceName: sourceExists?.name || rel.sourceName || '',
      targetName: targetExists?.name || rel.targetName || '',
      type: rel.type,
      description: rel.description || '',
      createdAt: new Date().toISOString()
    };
    gd.relations.push(newRel);
    added.push(newRel);
  }
  libraries[libIdx].updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ added, total: gd.relations.length });
});

// DELETE /api/knowledge/:id/graph/relations/:relId - 删除关系
router.delete('/:id/graph/relations/:relId', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  const gd = libraries[libIdx].graphData || { entities: [], relations: [] };
  gd.relations = gd.relations.filter(r => r.id !== req.params.relId);
  libraries[libIdx].updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  res.json({ success: true, relations: gd.relations.length });
});

// GET /api/knowledge/:id/graph - 获取图知识库数据（用于图谱可视化）
router.get('/:id/graph', (req, res) => {
  const data = readJSON(KNOWLEDGE_FILE);
  const lib = (data.libraries || []).find(k => k.id === req.params.id);
  if (!lib) return res.status(404).json({ error: '知识库不存在' });
  
  const gd = lib.graphData || { entities: [], relations: [] };
  
  // 如果没有显式的图数据，尝试从结构化文档中抽取
  if (gd.entities.length === 0 && lib.type === 'structured') {
    const extracted = extractGraphFromStructured(lib);
    res.json({ ...extracted, source: 'auto-extract' });
  } else {
    res.json({ entities: gd.entities, relations: gd.relations, source: 'manual' });
  }
});

// 从结构化文档中自动提取实体关系
function extractGraphFromStructured(lib) {
  const entities = [];
  const relations = [];
  const entityMap = new Map();
  
  // 如果有配置的索引字段作为实体类型
  const indexFields = lib.config?.indexFields || [];
  const entityField = indexFields[0] || null;
  
  for (const doc of lib.documents) {
    if (doc.type === 'structured' && doc.content) {
      try {
        const rows = csvParse(doc.content);
        if (rows.length < 2) continue;
        const headers = rows[0];
        const entityCol = entityField ? headers.indexOf(entityField) : 0;
        if (entityCol < 0) continue;
        const nameCol = headers[1] || headers[0];
        const nameIdx = headers.indexOf(nameCol);
        
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const entityName = row[entityCol] || row[0];
          const entityType = doc.name.replace(/\.[^.]+$/, '');
          if (entityName && !entityMap.has(entityName)) {
            const entity = {
              id: uuidv4(),
              name: entityName,
              type: entityType,
              description: row[nameIdx] || '',
              properties: {}
            };
            headers.forEach((h, j) => {
              if (j !== entityCol && row[j]) entity.properties[h] = row[j];
            });
            entities.push(entity);
            entityMap.set(entityName, entity);
          }
        }
      } catch(e) {}
    }
    
    // 从关键词列自动生成关系
    for (const seg of (doc.segments || [])) {
      const words = seg.content.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
      const foundEnts = [];
      for (const w of words) {
        if (entityMap.has(w)) foundEnts.push(entityMap.get(w));
      }
      for (let i = 0; i < foundEnts.length - 1; i++) {
        for (let j = i + 1; j < foundEnts.length; j++) {
          const exists = relations.find(r =>
            (r.sourceId === foundEnts[i].id && r.targetId === foundEnts[j].id) ||
            (r.sourceId === foundEnts[j].id && r.targetId === foundEnts[i].id)
          );
          if (!exists) {
            relations.push({
              id: uuidv4(),
              sourceId: foundEnts[i].id,
              targetId: foundEnts[j].id,
              sourceName: foundEnts[i].name,
              targetName: foundEnts[j].name,
              type: '关联',
              description: `基于文档 ${doc.name}`
            });
          }
        }
      }
    }
  }
  return { entities, relations };
}

// 简单CSV解析（处理双引号转义）
function csvParse(content) {
  const rows = [];
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const cols = [];
    let col = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { col += '"'; i++; }
        else inQuote = !inQuote;
      } else if ((ch === ',' || ch === '\t') && !inQuote) {
        cols.push(col.trim());
        col = '';
      } else {
        col += ch;
      }
    }
    cols.push(col.trim());
    rows.push(cols);
  }
  return rows;
}

// ----- 文档管理增强 -----

// PUT /api/knowledge/:id/documents/:docId - 更新文档（支持结构化文档内容更新）
router.put('/:id/documents/:docId', async (req, res) => {
  const { name, content, metadata, type } = req.body;
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  const docIdx = libraries[libIdx].documents.findIndex(d => d.id === req.params.docId);
  if (docIdx === -1) return res.status(404).json({ error: '文档不存在' });
  
  const doc = libraries[libIdx].documents[docIdx];
  if (name !== undefined) doc.name = name;
  if (content !== undefined) {
    doc.content = content;
    doc.status = 'parsing';
    // Re-parse structured content
    if (type === 'structured' || doc.type === 'structured') {
      try {
        const rows = csvParse(content);
        doc.metadata = { ...doc.metadata, headers: rows[0] || [], rowCount: rows.length - 1 };
        // Create simple segments from rows
        doc.segments = [];
        for (let i = 1; i < Math.min(rows.length, 100); i++) {
          doc.segments.push({
            id: `${doc.id}_seg_${i}`,
            content: rows[i].join(' | '),
            index: i - 1
          });
        }
        doc.status = 'parsed';
      } catch(e) {
        doc.status = 'error';
        doc.metadata = { ...doc.metadata, parseError: e.message };
      }
    } else {
      // Re-parse text content
      let paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 10);
      const merged = [];
      let buffer = '';
      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (buffer && buffer.length + trimmed.length < 500) {
          buffer += '\n\n' + trimmed;
        } else {
          if (buffer) merged.push(buffer);
          buffer = trimmed;
        }
      }
      if (buffer) merged.push(buffer);
      const canEmbed = await checkEmbeddingAvailable();
      doc.segments = [];
      for (let i = 0; i < merged.length; i++) {
        let embedding = null;
        if (canEmbed && merged[i].length > 20) {
          embedding = await embedText(merged[i]);
        }
        doc.segments.push({
          id: `${doc.id}_seg_${i}`,
          content: merged[i],
          index: i,
          embedding
        });
      }
      doc.status = 'parsed';
    }
  }
  if (metadata !== undefined) doc.metadata = { ...doc.metadata, ...metadata };
  if (type !== undefined) doc.type = type;
  doc.updatedAt = new Date().toISOString();
  
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  
  const cleanDoc = { ...doc };
  if (cleanDoc.segments) {
    cleanDoc.segments = cleanDoc.segments.map(s => ({ id: s.id, content: s.content.substring(0, 200), index: s.index }));
  }
  res.json(cleanDoc);
});

// POST /api/knowledge/:id/documents/import - 导入结构化数据（CSV/JSON直接传递）
router.post('/:id/documents/import', async (req, res) => {
  const { name, content, type } = req.body;
  if (!name || !content) return res.status(400).json({ error: '请提供文档名称和内容' });
  
  const data = readJSON(KNOWLEDGE_FILE);
  const libraries = data.libraries || [];
  const libIdx = libraries.findIndex(k => k.id === req.params.id);
  if (libIdx === -1) return res.status(404).json({ error: '知识库不存在' });
  
  const docType = type || 'structured';
  const doc = {
    id: uuidv4(),
    name,
    content,
    type: docType,
    status: 'parsing',
    metadata: {},
    segments: [],
    createdAt: new Date().toISOString()
  };
  
  if (docType === 'structured') {
    try {
      const rows = csvParse(content);
      doc.metadata = { headers: rows[0] || [], rowCount: rows.length - 1 };
      for (let i = 1; i < Math.min(rows.length, 500); i++) {
        doc.segments.push({
          id: `${doc.id}_seg_${i}`,
          content: rows[i].join(' | '),
          index: i - 1
        });
      }
      doc.status = 'parsed';
    } catch(e) {
      doc.status = 'error';
      doc.metadata = { parseError: e.message };
    }
  } else {
    // Text import
    let paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 10);
    const merged = [];
    let buffer = '';
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (buffer && buffer.length + trimmed.length < 500) buffer += '\n\n' + trimmed;
      else { if (buffer) merged.push(buffer); buffer = trimmed; }
    }
    if (buffer) merged.push(buffer);
    const canEmbed = await checkEmbeddingAvailable();
    for (let i = 0; i < merged.length; i++) {
      let embedding = null;
      if (canEmbed && merged[i].length > 20) embedding = await embedText(merged[i]);
      doc.segments.push({ id: `${doc.id}_seg_${i}`, content: merged[i], index: i, embedding });
    }
    doc.status = 'parsed';
  }
  
  libraries[libIdx].documents.push(doc);
  libraries[libIdx].updatedAt = new Date().toISOString();
  data.libraries = libraries;
  writeJSON(KNOWLEDGE_FILE, data);
  
  const cleanDoc = { ...doc };
  if (cleanDoc.segments) {
    cleanDoc.segments = cleanDoc.segments.map(s => ({ id: s.id, content: s.content.substring(0, 200), index: s.index }));
  }
  res.json(cleanDoc);
});

module.exports = router;

// Export for use in conversations.js
module.exports.vectorSearch = vectorSearch;
module.exports.checkEmbeddingAvailable = checkEmbeddingAvailable;
module.exports.embedText = embedText;
