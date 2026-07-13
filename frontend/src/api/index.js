import axios from 'axios';

const BASE_URL = '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000
});

// Request interceptor: inject auth token
api.interceptors.request.use(config => {
  try {
    const stored = localStorage.getItem('maiyu_auth');
    if (stored) {
      const auth = JSON.parse(stored);
      if (auth.token) {
        config.headers.Authorization = `Bearer ${auth.token}`;
      }
    }
  } catch (e) { /* ignore */ }
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    // Auto-redirect to login on 401
    if (err.response?.status === 401) {
      localStorage.removeItem('maiyu_auth');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const msg = err.response?.data?.error || err.message || '请求失败';
    return Promise.reject(new Error(msg));
  }
);

// ===== Agents =====
export const agentAPI = {
  list: (params) => api.get('/agents', { params }),
  listCategories: () => api.get('/agents/categories'),
  createCategory: (data) => api.post('/agents/categories', data),
  updateCategory: (id, data) => api.put(`/agents/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/agents/categories/${id}`),
  
  create: (data) => api.post('/agents', data),
  get: (id) => api.get(`/agents/${id}`),
  update: (id, data) => api.put(`/agents/${id}`, data),
  delete: (id) => api.delete(`/agents/${id}`),
  publish: (id) => api.post(`/agents/${id}/publish`),
  unpublish: (id) => api.post(`/agents/${id}/unpublish`),
  copy: (id) => api.post(`/agents/${id}/copy`),
  move: (id, categoryId) => api.post(`/agents/${id}/move`, { categoryId }),
  batch: (data) => api.post('/agents/batch', data),
  export: (ids) => api.post('/agents/export', { ids }),
  import: (agents) => api.post('/agents/import', { agents }),
  getPhrases: (id) => api.get(`/agents/${id}/phrases`),
  addPhrase: (id, text) => api.post(`/agents/${id}/phrases`, { text }),
  updatePhrase: (id, phraseId, text) => api.put(`/agents/${id}/phrases/${phraseId}`, { text }),
  deletePhrase: (id, phraseId) => api.delete(`/agents/${id}/phrases/${phraseId}`),
  getMetrics: (id) => api.get(`/agents/${id}/metrics`),
  evaluate: (id, testCases) => api.post(`/agents/${id}/evaluate`, { testCases }),
  getEvaluateResult: (id, taskId) => api.get(`/agents/${id}/evaluate/${taskId}`),
  getAuthorized: () => api.get('/agents/authorized')
};

// ===== Knowledge =====
export const knowledgeAPI = {
  list: (params) => api.get('/knowledge', { params }),
  create: (data) => api.post('/knowledge', data),
  get: (id) => api.get(`/knowledge/${id}`),
  update: (id, data) => api.put(`/knowledge/${id}`, data),
  updateConfig: (id, data) => api.put(`/knowledge/${id}/config`, data),
  delete: (id) => api.delete(`/knowledge/${id}`),
  publish: (id) => api.post(`/knowledge/${id}/publish`),
  unpublish: (id) => api.post(`/knowledge/${id}/unpublish`),
  addDocument: (id, data) => api.post(`/knowledge/${id}/documents`, data),
  updateDocument: (id, docId, data) => api.put(`/knowledge/${id}/documents/${docId}`, data),
  deleteDocument: (id, docId) => api.delete(`/knowledge/${id}/documents/${docId}`),
  importDocument: (id, data) => api.post(`/knowledge/${id}/documents/import`, data),
  
  // FAQ management
  addFaqs: (id, docId, faqs) => api.post(`/knowledge/${id}/documents/${docId}/faqs`, { faqs }),
  updateFaq: (id, docId, faqId, data) => api.put(`/knowledge/${id}/documents/${docId}/faqs/${faqId}`, data),
  deleteFaq: (id, docId, faqId) => api.delete(`/knowledge/${id}/documents/${docId}/faqs/${faqId}`),
  
  // Graph knowledge
  getGraph: (id) => api.get(`/knowledge/${id}/graph`),
  addEntities: (id, entities) => api.post(`/knowledge/${id}/graph/entities`, { entities }),
  deleteEntity: (id, entityId) => api.delete(`/knowledge/${id}/graph/entities/${entityId}`),
  addRelations: (id, relations) => api.post(`/knowledge/${id}/graph/relations`, { relations }),
  deleteRelation: (id, relId) => api.delete(`/knowledge/${id}/graph/relations/${relId}`),
  
  hitTest: (id, query) => api.post(`/knowledge/${id}/hit-test`, { query })
};

// ===== Plugins =====
export const pluginAPI = {
  list: (params) => api.get('/plugins', { params }),
  create: (data) => api.post('/plugins', data),
  get: (id) => api.get(`/plugins/${id}`),
  update: (id, data) => api.put(`/plugins/${id}`, data),
  delete: (id) => api.delete(`/plugins/${id}`),
  publish: (id) => api.post(`/plugins/${id}/publish`),
  unpublish: (id) => api.post(`/plugins/${id}/unpublish`),
  
  // MCP Servers
  listMcp: () => api.get('/plugins/mcp-servers/list'),
  createMcp: (data) => api.post('/plugins/mcp-servers', data),
  updateMcp: (id, data) => api.put(`/plugins/mcp-servers/${id}`, data),
  publishMcp: (id) => api.post(`/plugins/mcp-servers/${id}/publish`),
  deleteMcp: (id) => api.delete(`/plugins/mcp-servers/${id}`),
  
  // Light Apps
  listLightApps: () => api.get('/plugins/light-apps/list'),
  createLightApp: (data) => api.post('/plugins/light-apps', data),
  updateLightApp: (id, data) => api.put(`/plugins/light-apps/${id}`, data),
  publishLightApp: (id) => api.post(`/plugins/light-apps/${id}/publish`),
  deleteLightApp: (id) => api.delete(`/plugins/light-apps/${id}`),
  
  // Builtin
  listBuiltin: () => api.get('/plugins/builtin/list'),

  // Test & Usage
  test: (id, variables) => api.post(`/plugins/${id}/test`, { variables }),
  testMcp: (id) => api.post(`/plugins/mcp-servers/${id}/test`),
  getUsage: () => api.get('/plugins/usage/list')
};

// ===== Business Knowledge =====
export const businessAPI = {
  // Terms
  listTerms: (params) => api.get('/business/terms', { params }),
  createTerm: (data) => api.post('/business/terms', data),
  updateTerm: (id, data) => api.put(`/business/terms/${id}`, data),
  deleteTerm: (id) => api.delete(`/business/terms/${id}`),
  
  // Dictionaries
  listDictionaries: (params) => api.get('/business/dictionaries', { params }),
  createDictionary: (data) => api.post('/business/dictionaries', data),
  updateDictionary: (id, data) => api.put(`/business/dictionaries/${id}`, data),
  deleteDictionary: (id) => api.delete(`/business/dictionaries/${id}`),
  
  // Samples
  listSamples: () => api.get('/business/samples'),
  createSample: (data) => api.post('/business/samples', data),
  deleteSample: (id) => api.delete(`/business/samples/${id}`),
  
  // Metrics
  getMetrics: () => api.get('/business/metrics')
};

// ===== Models =====
export const modelAPI = {
  list: () => api.get('/models'),
  updateProvider: (providerId, data) => api.put(`/models/${providerId}`, data),
  test: (providerId) => api.post(`/models/${providerId}/test`),
  updateModel: (providerId, modelId, data) => api.put(`/models/${providerId}/models/${modelId}`, data),
  addModel: (providerId, data) => api.post(`/models/${providerId}/models`, data),
  deleteModel: (providerId, modelId) => api.delete(`/models/${providerId}/models/${modelId}`)
};

// ===== Conversations =====
export const convAPI = {
  list: (agentId) => api.get(`/conversations/${agentId}`),
  create: (agentId, data) => api.post(`/conversations/${agentId}`, data),
  get: (agentId, convId) => api.get(`/conversations/${agentId}/${convId}`),
  delete: (agentId, convId) => api.delete(`/conversations/${agentId}/${convId}`)
};

// ===== Workflow =====
export const workflowAPI = {
  list: () => api.get('/workflow/list'),
  get: (agentId) => api.get(`/workflow/${agentId}`),
  save: (agentId, data) => api.post(`/workflow/${agentId}`, data),
  delete: (agentId) => api.delete(`/workflow/${agentId}`)
};

// ===== Upload =====
export const uploadAPI = {
  document: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/upload/document', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000
    });
  }
};

// SSE chat function
export function createSSEChat(agentId, convId, message, variables, onChunk, onDone, onError, onPlugins) {
  const ctrl = new AbortController();
  
  // Inject auth header
  const headers = { 'Content-Type': 'application/json' };
  try {
    const stored = localStorage.getItem('maiyu_auth');
    if (stored) {
      const auth = JSON.parse(stored);
      if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
    }
  } catch (e) { /* ignore */ }
  
  fetch(`${BASE_URL}/conversations/${agentId}/${convId}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, variables }),
    signal: ctrl.signal
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'plugins') {
              if (onPlugins) onPlugins(data.results);
              continue;
            }
            if (data.error) {
              onError(data.error);
              return;
            }
            if (data.done) {
              onDone(data.messageId, data.citations || []);
              return;
            }
            if (data.content) {
              onChunk(data.content);
            }
          } catch (e) {}
        }
      }
    }
  }).catch(err => {
    if (err.name !== 'AbortError') {
      onError(err.message);
    }
  });
  
  return () => ctrl.abort();
}

export function createSSEGenerate(agentId, variables, onChunk, onDone, onError) {
  const ctrl = new AbortController();
  
  // Inject auth header
  const headers = { 'Content-Type': 'application/json' };
  try {
    const stored = localStorage.getItem('maiyu_auth');
    if (stored) {
      const auth = JSON.parse(stored);
      if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
    }
  } catch (e) { /* ignore */ }
  
  fetch(`${BASE_URL}/conversations/${agentId}/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ variables }),
    signal: ctrl.signal
  }).then(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { onError(data.error); return; }
            if (data.done) { onDone(); return; }
            if (data.content) { onChunk(data.content); }
          } catch (e) {}
        }
      }
    }
  }).catch(err => {
    if (err.name !== 'AbortError') onError(err.message);
  });
  
  return () => ctrl.abort();
}

export default api;
