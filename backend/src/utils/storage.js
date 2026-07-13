const fs = require('fs');
const path = require('path');

// On Vercel the filesystem is read-only except /tmp. Use /tmp for runtime
// data and seed it from the bundled read-only copy under backend/data.
const isVercel = !!process.env.VERCEL;
const SEED_DIR = path.join(__dirname, '../../data');
const DATA_DIR = isVercel ? path.join('/tmp', 'maiyu-workshop-data') : SEED_DIR;
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');
const PLUGINS_FILE = path.join(DATA_DIR, 'plugins.json');
const MODELS_FILE = path.join(DATA_DIR, 'models.json');
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');
const WORKFLOW_FILE = path.join(DATA_DIR, 'workflows.json');

// Recursively copy a directory (used to seed /tmp on Vercel from the
// read-only bundled copy under backend/data).
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Ensure directories and files exist
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // On Vercel, seed runtime data from the read-only bundled copy.
    if (isVercel && fs.existsSync(SEED_DIR)) {
      copyDir(SEED_DIR, DATA_DIR);
    }
  }
  if (!fs.existsSync(CONVERSATIONS_DIR)) fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  if (!fs.existsSync(path.join(DATA_DIR, 'uploads'))) {
    fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  }

  // On Vercel the seed copy already contains agents/knowledge/plugins/models,
  // so we only need to make sure the workflow file exists.
  if (isVercel) {
    if (!fs.existsSync(WORKFLOW_FILE)) {
      fs.writeFileSync(WORKFLOW_FILE, JSON.stringify({ workflows: {} }, null, 2));
    }
    return;
  }

  if (!fs.existsSync(WORKFLOW_FILE)) {
    fs.writeFileSync(WORKFLOW_FILE, JSON.stringify({ workflows: {} }, null, 2));
  }
  
  if (!fs.existsSync(AGENTS_FILE)) {
    fs.writeFileSync(AGENTS_FILE, JSON.stringify({ agents: [], categories: [] }, null, 2));
  }
  if (!fs.existsSync(KNOWLEDGE_FILE)) {
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify({ libraries: [] }, null, 2));
  }
  if (!fs.existsSync(PLUGINS_FILE)) {
    fs.writeFileSync(PLUGINS_FILE, JSON.stringify({ plugins: [] }, null, 2));
  }
  if (!fs.existsSync(MODELS_FILE)) {
    const defaultProviders = {
      providers: [
        {
          id: 'ollama',
          name: 'Ollama',
          icon: '🦙',
          type: 'ollama',
          baseUrl: 'http://localhost:11434',
          apiKey: '',
          status: 'online',
          models: [
            { id: 'llama3', name: 'Llama3', maxTokens: 4096, contextWindow: 8192, category: 'text', enabled: true },
            { id: 'qwen2.5', name: 'Qwen 2.5', maxTokens: 4096, contextWindow: 32768, category: 'text', enabled: false },
            { id: 'deepseek-r1', name: 'DeepSeek R1', maxTokens: 8192, contextWindow: 128000, category: 'text', enabled: false }
          ]
        },
        {
          id: 'openai',
          name: 'OpenAI',
          icon: '🤖',
          type: 'openai',
          baseUrl: 'https://api.openai.com',
          apiKey: '',
          status: 'offline',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 16384, contextWindow: 128000, category: 'text', enabled: true },
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 8192, contextWindow: 8192, category: 'text', enabled: true },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 4096, contextWindow: 16385, category: 'text', enabled: false }
          ]
        },
        {
          id: 'zhipu',
          name: '智谱AI',
          icon: '🔮',
          type: 'openai',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
          apiKey: '',
          status: 'offline',
          models: [
            { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash', maxTokens: 128000, contextWindow: 200000, category: 'text', enabled: true },
            { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash', maxTokens: 128000, contextWindow: 128000, category: 'text', enabled: false },
            { id: 'glm-4-flash-250414', name: 'GLM-4 Flash', maxTokens: 128000, contextWindow: 128000, category: 'text', enabled: false },
            { id: 'glm-4.6v-flash', name: 'GLM-4.6V Flash', maxTokens: 16384, contextWindow: 128000, category: 'vision', enabled: false },
            { id: 'glm-4.1v-thinking-flash', name: 'GLM-4.1V Thinking Flash', maxTokens: 16384, contextWindow: 64000, category: 'vision', enabled: false },
            { id: 'glm-4v-flash', name: 'GLM-4V Flash', maxTokens: 4096, contextWindow: 16000, category: 'vision', enabled: false },
            { id: 'cogview-3-flash', name: 'CogView-3 Flash', maxTokens: 4096, contextWindow: 0, category: 'image', enabled: false },
            { id: 'cogvideox-flash', name: 'CogVideoX Flash', maxTokens: 4096, contextWindow: 0, category: 'video', enabled: false }
          ]
        }
      ]
    };
    fs.writeFileSync(MODELS_FILE, JSON.stringify(defaultProviders, null, 2));
  }
}

ensureDataDir();

// Generic read/write helpers
function readJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper: find provider and model in the new structure
function findModelConfig(data, providerId, modelId) {
  const provider = (data.providers || []).find(p => p.id === providerId);
  if (!provider) return null;
  const model = provider.models.find(m => m.id === modelId && m.enabled !== false);
  if (!model) return null;
  return { provider, model };
}

module.exports = {
  DATA_DIR,
  AGENTS_FILE,
  KNOWLEDGE_FILE,
  PLUGINS_FILE,
  MODELS_FILE,
  CONVERSATIONS_DIR,
  WORKFLOW_FILE,
  readJSON,
  writeJSON,
  findModelConfig
};
