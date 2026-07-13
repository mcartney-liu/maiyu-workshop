import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agentAPI, knowledgeAPI, pluginAPI, modelAPI, convAPI, createSSEChat } from '../../api';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';

function formatWindow(k) {
  if (!k || k === 0) return '';
  if (k >= 1000) return (k / 1000).toFixed(0) + 'K';
  return k.toString();
}

export default function AdminAgentConfig() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [agent, setAgent] = useState(null);
  const [providers, setProviders] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentAvatar, setAgentAvatar] = useState('');
  
  // Phrases
  const [phrases, setPhrases] = useState([]);
  const [newPhraseText, setNewPhraseText] = useState('');
  const [editingPhrase, setEditingPhrase] = useState(null);
  const [editPhraseText, setEditPhraseText] = useState('');
  
  // Config state
  const [config, setConfig] = useState(null);
  
  // Debug preview
  const [debugMessages, setDebugMessages] = useState([]);
  const [debugInput, setDebugInput] = useState('');
  const [debugStreaming, setDebugStreaming] = useState(false);
  const [debugConvId, setDebugConvId] = useState(null);
  
  // Tab
  const [activeTab, setActiveTab] = useState('prompt');

  useEffect(() => {
    loadAll();
  }, [agentId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [agentRes, modelRes, kbRes, pluginRes] = await Promise.all([
        agentAPI.get(agentId),
        modelAPI.list(),
        knowledgeAPI.list({ status: 'published' }),
        pluginAPI.list({ status: 'published' })
      ]);
      const a = agentRes.data;
      setAgent(a);
      setConfig({ ...a.config });
      setAgentName(a.name || '');
      setAgentDescription(a.description || '');
      setAgentAvatar(a.avatar || '');
      setPhrases(a.phrases || []);
      setProviders(modelRes.data.providers || []);
      setKnowledgeBases(kbRes.data.libraries || []);
      setPlugins(pluginRes.data.plugins || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await agentAPI.update(agentId, {
        name: agentName.trim() || agent?.name,
        description: agentDescription,
        avatar: agentAvatar,
        config,
        workflow: agent?.workflow
      });
      setAgent(prev => ({ ...prev, name: agentName, description: agentDescription, avatar: agentAvatar }));
      toast.success('配置已保存');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const addPrompt = () => {
    const lastRole = config.prompts[config.prompts.length - 1]?.role || 'user';
    const roles = ['user', 'system', 'assistant'];
    const nextRole = roles[(roles.indexOf(lastRole) + 1) % roles.length];
    updateConfig('prompts', [...config.prompts, { role: nextRole, content: '' }]);
  };

  const updatePrompt = (idx, field, value) => {
    const newPrompts = [...config.prompts];
    newPrompts[idx] = { ...newPrompts[idx], [field]: value };
    updateConfig('prompts', newPrompts);
  };

  const removePrompt = (idx) => {
    if (config.prompts.length <= 1) return;
    updateConfig('prompts', config.prompts.filter((_, i) => i !== idx));
  };

  const addVariable = () => {
    updateConfig('variables', [...(config.variables || []), {
      name: `var_${Date.now()}`, label: '', required: false,
      style: 'text', defaultValue: '', options: [], maxLength: 200
    }]);
  };

  const updateVariable = (idx, field, value) => {
    const vars = [...(config.variables || [])];
    vars[idx] = { ...vars[idx], [field]: value };
    updateConfig('variables', vars);
  };

  const removeVariable = (idx) => {
    updateConfig('variables', (config.variables || []).filter((_, i) => i !== idx));
  };

  const toggleKnowledge = (kbId) => {
    const current = config.knowledgeBases || [];
    if (current.includes(kbId)) {
      updateConfig('knowledgeBases', current.filter(id => id !== kbId));
    } else {
      updateConfig('knowledgeBases', [...current, kbId]);
    }
  };

  const togglePlugin = (pluginId) => {
    const current = config.plugins || [];
    if (current.includes(pluginId)) {
      updateConfig('plugins', current.filter(id => id !== pluginId));
    } else {
      updateConfig('plugins', [...current, pluginId]);
    }
  };

  // Quick phrases
  const handleAddPhrase = async () => {
    if (!newPhraseText.trim()) return;
    try {
      const res = await agentAPI.addPhrase(agentId, newPhraseText);
      setPhrases(prev => [...prev, res.data]);
      setNewPhraseText('');
      toast.success('短语已添加');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleUpdatePhrase = async (phraseId) => {
    if (!editPhraseText.trim()) return;
    try {
      const res = await agentAPI.updatePhrase(agentId, phraseId, editPhraseText);
      setPhrases(prev => prev.map(p => p.id === phraseId ? res.data : p));
      setEditingPhrase(null);
      setEditPhraseText('');
      toast.success('短语已更新');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDeletePhrase = async (phraseId) => {
    try {
      await agentAPI.deletePhrase(agentId, phraseId);
      setPhrases(prev => prev.filter(p => p.id !== phraseId));
      toast.success('短语已删除');
    } catch (e) {
      toast.error(e.message);
    }
  };

  // Debug chat
  const startDebugConv = async () => {
    try {
      await agentAPI.update(agentId, { config });
      const res = await convAPI.create(agentId, {});
      setDebugConvId(res.data.id);
      setDebugMessages(res.data.messages || []);
      toast.success('调试会话已启动');
    } catch (e) {
      toast.error('启动调试失败: ' + e.message);
    }
  };

  const sendDebugMessage = () => {
    if (!debugInput.trim() || debugStreaming || !debugConvId) return;
    const msg = debugInput.trim();
    setDebugInput('');
    
    const tempUser = { id: 'u_' + Date.now(), role: 'user', content: msg };
    const tempAI = { id: 'a_' + Date.now(), role: 'assistant', content: '', loading: true };
    setDebugMessages(prev => [...prev, tempUser, tempAI]);
    setDebugStreaming(true);
    
    let acc = '';
    createSSEChat(
      agentId, debugConvId, msg, {},
      (chunk) => { acc += chunk; setDebugMessages(prev => prev.map(m => m.id === tempAI.id ? { ...m, content: acc, loading: false } : m)); },
      () => setDebugStreaming(false),
      (err) => { setDebugStreaming(false); setDebugMessages(prev => prev.map(m => m.id === tempAI.id ? { ...m, content: '❌ ' + err, loading: false } : m)); }
    );
  };

  if (loading || !config) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>;
  }

  const TABS = [
    { id: 'prompt', label: '📝 提示词' },
    { id: 'variables', label: '🔧 变量' },
    { id: 'knowledge', label: '📚 知识库' },
    { id: 'plugins', label: '🔌 插件' },
    { id: 'phrases', label: '💬 快捷短语' },
    { id: 'settings', label: '⚙️ 其他设置' }
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        padding: '14px 24px',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0
      }}>
        <button onClick={() => navigate('/admin/agents')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#64748b' }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{agentName || agent?.name} · 配置</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{agent?.buildMode === 'workflow' ? '🔀 编排模式' : '简易模式'}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-outline" onClick={() => navigate('/admin/agents')}>取消</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner spinner-sm" /> : null} 保存
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left config panel */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', maxWidth: 680 }}>
          {/* Basic info */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>🤖 基本信息</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0 }}>
                <label className="form-label">头像</label>
                <input
                  className="form-input"
                  value={agentAvatar}
                  onChange={e => setAgentAvatar(e.target.value)}
                  placeholder="🤖"
                  style={{ width: 64, fontSize: 24, textAlign: 'center', padding: '4px' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">名称 <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    className="form-input"
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder="智能体名称"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">描述</label>
                  <input
                    className="form-input"
                    value={agentDescription}
                    onChange={e => setAgentDescription(e.target.value)}
                    placeholder="简要描述该智能体的用途"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Workflow mode banner */}
          {agent?.buildMode === 'workflow' && (
            <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #2A83FF 0%, #1F6AE0 100%)', color: '#fff' }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 15 }}>🔀 编排模式</div>
              <p style={{ fontSize: 13, opacity: 0.9, marginBottom: 14 }}>
                该智能体使用工作流编排模式，对话将按工作流节点执行。请在编排编辑器中配置节点和流程。
              </p>
              <button
                onClick={() => navigate(`/admin/workflow/${agentId}`)}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
                  color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 500
                }}
              >
                前往编排编辑器 →
              </button>
            </div>
          )}
          {/* Model selection */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>⚡ 模型服务</div>
            <div className="form-group">
              <label className="form-label">厂商</label>
              <select
                className="form-select"
                value={config.providerId || ''}
                onChange={e => updateConfig('providerId', e.target.value)}
              >
                <option value="">请选择模型厂商</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.icon || '🔌'} {p.name} ({p.status === 'online' ? '✅ 在线' : '❌ 离线'})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">模型</label>
              <select
                className="form-select"
                value={config.modelId || ''}
                onChange={e => updateConfig('modelId', e.target.value)}
                disabled={!config.providerId}
              >
                <option value="">请选择模型</option>
                {(providers.find(p => p.id === config.providerId)?.models || [])
                  .filter(m => m.enabled !== false)
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.category || 'text'} · {(m.contextWindow || m.maxTokens) > 0 ? formatWindow(m.contextWindow || m.maxTokens) + ' ctx' : ''})
                    </option>
                  ))
                }
              </select>
              {config.providerId && (providers.find(p => p.id === config.providerId)?.models || []).filter(m => m.enabled !== false).length === 0 && (
                <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 6 }}>
                  ⚠️ 该厂商下没有启用的模型，请在「模型管理」中启用
                </div>
              )}
              {providers.length === 0 && (
                <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 6 }}>
                  ⚠️ 暂无模型服务，请先在「模型管理」中添加
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">温度 ({config.temperature})</label>
                <input type="range" min="0" max="1" step="0.1" value={config.temperature || 0.7}
                  onChange={e => updateConfig('temperature', parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
              </div>
              <div>
                <label className="form-label">多样性 ({config.topP})</label>
                <input type="range" min="0" max="1" step="0.1" value={config.topP || 0.9}
                  onChange={e => updateConfig('topP', parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
              </div>
              <div>
                <label className="form-label">最大输出 Token</label>
                <input className="form-input" type="number" min="128" max="8192" step="128"
                  value={config.maxOutput || 2048}
                  onChange={e => updateConfig('maxOutput', parseInt(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '9px 14px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? '#2A83FF' : '#64748b',
                  borderBottom: activeTab === tab.id ? '2px solid #2A83FF' : '2px solid transparent',
                  marginBottom: -1
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'prompt' && (
            <div>
              {(config.prompts || []).map((prompt, idx) => (
                <div key={idx} className="card" style={{ marginBottom: 12, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <select
                      className="form-select"
                      style={{ width: 120 }}
                      value={prompt.role}
                      onChange={e => updatePrompt(idx, 'role', e.target.value)}
                    >
                      <option value="system">System</option>
                      <option value="user">User</option>
                      <option value="assistant">Assistant</option>
                    </select>
                    <div style={{ flex: 1, fontSize: 12, color: '#94a3b8' }}>
                      {prompt.role === 'system' ? '设置背景和角色' : prompt.role === 'user' ? '用户消息模板，用{{变量名}}插入变量' : '示例回复'}
                    </div>
                    {config.prompts.length > 1 && (
                      <button onClick={() => removePrompt(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16 }}>×</button>
                    )}
                  </div>
                  <textarea
                    className="form-textarea"
                    rows={5}
                    value={prompt.content}
                    onChange={e => updatePrompt(idx, 'content', e.target.value)}
                    placeholder={prompt.role === 'system' ? '你是一个专业的...' : prompt.role === 'user' ? '用户问题：{{query}}' : ''}
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                  />
                </div>
              ))}
              <button className="btn btn-outline" onClick={addPrompt} style={{ width: '100%' }}>
                ＋ 添加消息
              </button>
            </div>
          )}

          {activeTab === 'variables' && (
            <div>
              {(config.variables || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: 14 }}>
                  暂无变量，点击下方按钮添加
                </div>
              ) : (
                (config.variables || []).map((v, idx) => (
                  <div key={idx} className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                      <div>
                        <label className="form-label">变量名（英文）</label>
                        <input className="form-input" value={v.name} onChange={e => updateVariable(idx, 'name', e.target.value)} placeholder="var_name" />
                      </div>
                      <div>
                        <label className="form-label">显示标签</label>
                        <input className="form-input" value={v.label} onChange={e => updateVariable(idx, 'label', e.target.value)} placeholder="用户看到的名称" />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="form-label">输入样式</label>
                        <select className="form-select" value={v.style} onChange={e => updateVariable(idx, 'style', e.target.value)}>
                          <option value="text">文本</option>
                          <option value="paragraph">段落</option>
                          <option value="select">选项</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label">默认值</label>
                        <input className="form-input" value={v.defaultValue} onChange={e => updateVariable(idx, 'defaultValue', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <label className="form-label">
                          <input type="checkbox" checked={v.required} onChange={e => updateVariable(idx, 'required', e.target.checked)} style={{ marginRight: 6 }} />
                          必填
                        </label>
                        <button className="btn btn-danger btn-sm" onClick={() => removeVariable(idx)}>删除</button>
                      </div>
                    </div>
                    {v.style === 'select' && (
                      <div style={{ marginTop: 10 }}>
                        <label className="form-label">选项列表（每行一个）</label>
                        <textarea className="form-textarea" rows={3}
                          value={(v.options || []).join('\n')}
                          onChange={e => updateVariable(idx, 'options', e.target.value.split('\n').filter(o => o.trim()))}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
              <button className="btn btn-outline" onClick={addVariable} style={{ width: '100%' }}>＋ 添加变量</button>
            </div>
          )}

          {activeTab === 'knowledge' && (
            <div>
              {knowledgeBases.length === 0 ? (
                <div className="empty-state" style={{ padding: '30px' }}>
                  <p>暂无已发布的知识库，请先在知识库管理中创建并发布</p>
                </div>
              ) : (
                knowledgeBases.map(kb => (
                  <div key={kb.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={(config.knowledgeBases || []).includes(kb.id)}
                      onChange={() => toggleKnowledge(kb.id)}
                      style={{ width: 16, height: 16 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{kb.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {kb.type === 'document' ? '📄 文本文档' : kb.type === 'faq' ? '❓ FAQ' : kb.type === 'graph' ? '🔗 图知识库' : '📊 结构化'}
                        {kb.type === 'graph'
                          ? ` · ${kb.graphData?.entities?.length || 0} 实体, ${kb.graphData?.relations?.length || 0} 关系`
                          : ` · ${kb.documents?.length || 0} 个文档`
                        }
                      </div>
                    </div>
                  </div>
                ))
              )}
              {(config.knowledgeBases || []).length > 0 && (
                <div className="card" style={{ marginTop: 12, background: '#f8fafc' }}>
                  <div style={{ fontWeight: 500, marginBottom: 10, fontSize: 14 }}>知识库参数配置</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">搜索方式</label>
                      <select className="form-select" value={config.knowledgeConfig?.searchMode || 'semantic'}
                        onChange={e => updateConfig('knowledgeConfig', { ...(config.knowledgeConfig || {}), searchMode: e.target.value })}>
                        <option value="semantic">语义检索</option>
                        <option value="es">ES检索</option>
                        <option value="hybrid">混合检索</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">置信度 ({config.knowledgeConfig?.confidence || 0.5})</label>
                      <input type="range" min="0" max="1" step="0.05"
                        value={config.knowledgeConfig?.confidence || 0.5}
                        onChange={e => updateConfig('knowledgeConfig', { ...(config.knowledgeConfig || {}), confidence: parseFloat(e.target.value) })}
                        style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'plugins' && (
            <div>
              {plugins.length === 0 ? (
                <div className="empty-state" style={{ padding: '30px' }}>
                  <p>暂无已发布的插件，请先在插件库管理中创建并发布</p>
                </div>
              ) : (
                plugins.map(plugin => (
                  <div key={plugin.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={(config.plugins || []).includes(plugin.id)}
                      onChange={() => togglePlugin(plugin.id)}
                      style={{ width: 16, height: 16 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{plugin.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{plugin.description}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'phrases' && (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>添加快捷短语</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    value={newPhraseText}
                    onChange={e => setNewPhraseText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddPhrase()}
                    placeholder="输入短语内容，按回车添加"
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleAddPhrase} disabled={!newPhraseText.trim()}>
                    ＋ 添加
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                  快捷短语将显示在对话页面中，用户可以快速点击发起提问
                </div>
              </div>

              {phrases.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px' }}>
                  <p style={{ color: '#94a3b8', fontSize: 13 }}>暂无快捷短语</p>
                </div>
              ) : (
                <div>
                  {phrases.map((phrase, idx) => (
                    <div key={phrase.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 20 }}>{idx + 1}.</span>
                      {editingPhrase === phrase.id ? (
                        <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                          <input
                            className="form-input"
                            value={editPhraseText}
                            onChange={e => setEditPhraseText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdatePhrase(phrase.id)}
                            style={{ flex: 1 }}
                            autoFocus
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => handleUpdatePhrase(phrase.id)}>保存</button>
                          <button className="btn btn-outline btn-sm" onClick={() => { setEditingPhrase(null); setEditPhraseText(''); }}>取消</button>
                        </div>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 14 }}>{phrase.text}</span>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => { setEditingPhrase(phrase.id); setEditPhraseText(phrase.text); }}
                            title="编辑"
                          >✎</button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeletePhrase(phrase.id)}
                            title="删除"
                          >×</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div>
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 14 }}>💬 开场白与推荐问题</div>
                <div className="form-group">
                  <label className="form-label">开场白（1-500字符）</label>
                  <textarea className="form-textarea" rows={3} maxLength={500}
                    value={config.greeting || ''}
                    onChange={e => updateConfig('greeting', e.target.value)}
                    placeholder="智能体启动时显示的第一句话..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">推荐问题（最多3条）</label>
                  {[0, 1, 2].map(i => (
                    <input key={i} className="form-input" style={{ marginBottom: 8 }} maxLength={200}
                      value={(config.suggestedQuestions || [])[i] || ''}
                      onChange={e => {
                        const q = [...(config.suggestedQuestions || ['', '', ''])];
                        q[i] = e.target.value;
                        updateConfig('suggestedQuestions', q);
                      }}
                      placeholder={`推荐问题 ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 14 }}>🔧 附加功能</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={config.features?.nextQuestions || false}
                      onChange={e => updateConfig('features', { ...(config.features || {}), nextQuestions: e.target.checked })}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>下一步问题建议</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>回答后自动给出3个相关问题</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={config.features?.rawTextRender || false}
                      onChange={e => updateConfig('features', { ...(config.features || {}), rawTextRender: e.target.checked })}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>按原文本渲染</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>关闭Markdown格式渲染</div>
                    </div>
                  </label>
                </div>
              </div>
              
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 14 }}>🔀 工作流模式</div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={agent?.workflow?.enabled || false}
                    onChange={e => setAgent(prev => ({ ...prev, workflow: { enabled: e.target.checked } }))}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>启用工作流编排</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      开启后对话将按工作流节点执行，而非直接调用LLM。<br/>
                      适用于 NL2SQL、多步骤推理等复杂场景。
                    </div>
                    {agent?.workflow?.enabled && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#E8F2FF', borderRadius: 6, fontSize: 12, color: '#1F6AE0' }}>
                        ⚡ 对话时将优先执行工作流，请在「工作流」页面配置节点。
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Right: Debug preview */}
        <div style={{
          width: 380,
          background: 'white',
          borderLeft: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: 15 }}>
            🔍 调试预览
          </div>
          
          {!debugConvId ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '20px' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{agent?.avatar || '🤖'}</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{agent?.name}</div>
              {config.greeting && (
                <div style={{
                  background: '#f0f4ff', borderRadius: 10, padding: '12px 16px',
                  fontSize: 14, textAlign: 'center', color: '#374151', maxWidth: 300
                }}>
                  {config.greeting}
                </div>
              )}
              <button className="btn btn-primary" onClick={startDebugConv}>
                开始调试
              </button>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                {debugMessages.map((msg, i) => (
                  <div key={i} style={{
                    display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    gap: 8, marginBottom: 12, alignItems: 'flex-start'
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: msg.role === 'user' ? '#2A83FF' : '#E8F2FF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0
                    }}>
                      {msg.role === 'user' ? '👤' : (agent?.avatar || '🤖')}
                    </div>
                    <div style={{
                      maxWidth: '80%',
                      background: msg.role === 'user' ? '#2A83FF' : '#f8fafc',
                      color: msg.role === 'user' ? 'white' : '#1e293b',
                      borderRadius: 10, padding: '8px 12px',
                      fontSize: 13, lineHeight: 1.6,
                      border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0'
                    }}>
                      {msg.loading ? <span className="spinner spinner-sm" /> : 
                        msg.role === 'assistant' ? (
                          <div className="prose" style={{ fontSize: 13 }}>
                            {msg.content}
                          </div>
                        ) : msg.content}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  value={debugInput}
                  onChange={e => setDebugInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendDebugMessage()}
                  placeholder="输入测试消息..."
                  disabled={debugStreaming}
                />
                <button className="btn btn-primary btn-sm" onClick={sendDebugMessage} disabled={debugStreaming || !debugInput.trim()}>
                  发
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
