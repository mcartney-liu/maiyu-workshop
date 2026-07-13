import React, { useState, useEffect } from 'react';
import { modelAPI } from '../../api';
import { useToast } from '../../components/Toast';

const CATEGORY_TAGS = {
  text: { label: '文本', color: '#2A83FF', bg: '#E8F2FF' },
  vision: { label: '视觉', color: '#0EA5E9', bg: '#E0F2FE' },
  image: { label: '图像', color: '#f59e0b', bg: '#fef3c7' },
  video: { label: '视频', color: '#ec4899', bg: '#fce7f3' },
  custom: { label: '自定义', color: '#64748b', bg: '#f1f5f9' }
};

function formatWindow(k) {
  if (!k || k === 0) return '-';
  if (k >= 1000) return (k / 1000).toFixed(0) + 'K';
  return k.toString();
}

export default function AdminModels() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [editingProvider, setEditingProvider] = useState(null);
  const [editForm, setEditForm] = useState({ baseUrl: '', apiKey: '', name: '' });
  const [addingModel, setAddingModel] = useState(null);
  const [newModelForm, setNewModelForm] = useState({ id: '', name: '', maxTokens: 4096, contextWindow: 8192 });
  const toast = useToast();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await modelAPI.list();
      setProviders(res.data.providers || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleTest = async (providerId) => {
    setTestingId(providerId);
    try {
      const res = await modelAPI.test(providerId);
      if (res.data.success) {
        toast.success('✅ 连接成功');
      } else {
        toast.error('❌ ' + res.data.message);
      }
      loadData();
    } catch (e) { toast.error(e.message); }
    finally { setTestingId(null); }
  };

  const handleSaveProvider = async () => {
    try {
      await modelAPI.updateProvider(editingProvider, editForm);
      toast.success('配置已保存');
      setEditingProvider(null);
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handleToggleModel = async (providerId, modelId, enabled) => {
    try {
      await modelAPI.updateModel(providerId, modelId, { enabled: !enabled });
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handleAddModel = async () => {
    if (!newModelForm.id.trim() || !newModelForm.name.trim()) {
      return toast.error('请填写模型ID和名称');
    }
    try {
      await modelAPI.addModel(addingModel, newModelForm);
      toast.success('模型已添加');
      setAddingModel(null);
      setNewModelForm({ id: '', name: '', maxTokens: 4096, contextWindow: 8192 });
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const openEditProvider = (p) => {
    setEditingProvider(p.id);
    setEditForm({ baseUrl: p.baseUrl, apiKey: p.apiKey || '', name: p.name });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>⚡ 模型服务管理</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            按厂商管理模型服务。每个厂商配置一套 API Key，可选择启用该厂商下的多个模型。
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {providers.map(provider => (
            <div key={provider.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Provider header */}
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                borderBottom: '1px solid #e2e8f0',
                background: '#fafbfc'
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: provider.status === 'online' ? '#d1fae5' : '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22
                }}>
                  {provider.icon || '🔌'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{provider.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                    {provider.baseUrl}
                  </div>
                </div>
                <span className={`tag ${provider.status === 'online' ? 'tag-success' : 'tag-gray'}`} style={{ fontSize: 11 }}>
                  {provider.status === 'online' ? '● 在线' : '○ 离线'}
                </span>
                <button className="btn btn-outline btn-sm" onClick={() => openEditProvider(provider)}>⚙️ 配置</button>
                <button className="btn btn-outline btn-sm" onClick={() => handleTest(provider.id)} disabled={testingId === provider.id}>
                  {testingId === provider.id ? <span className="spinner spinner-sm" /> : '🔍 测试'}
                </button>
              </div>

              {/* Provider config panel */}
              {editingProvider === provider.id && (
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #e2e8f0',
                  background: '#f0f4ff',
                  display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap'
                }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="form-label" style={{ fontSize: 12 }}>接口地址</label>
                    <input className="form-input" style={{ fontSize: 13 }}
                      value={editForm.baseUrl}
                      onChange={e => setEditForm(f => ({ ...f, baseUrl: e.target.value }))} />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="form-label" style={{ fontSize: 12 }}>API Key</label>
                    <input className="form-input" type="password" style={{ fontSize: 13 }}
                      value={editForm.apiKey}
                      onChange={e => setEditForm(f => ({ ...f, apiKey: e.target.value }))}
                      placeholder={provider.type === 'ollama' ? 'Ollama 无需 Key' : 'sk-...'}
                      disabled={provider.type === 'ollama'} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveProvider}>💾 保存</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditingProvider(null)}>取消</button>
                  </div>
                </div>
              )}

              {/* Models grid */}
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#475569', marginBottom: 12 }}>
                  可用模型 ({provider.models.filter(m => m.enabled).length}/{provider.models.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                  {provider.models.map(model => {
                    const cat = CATEGORY_TAGS[model.category] || CATEGORY_TAGS.custom;
                    return (
                      <div key={model.id}
                        style={{
                          padding: '12px 14px', borderRadius: 10,
                          border: '1px solid', borderColor: model.enabled ? '#e2e8f0' : '#f1f5f9',
                          background: model.enabled ? 'white' : '#fafbfc',
                          opacity: model.enabled ? 1 : 0.55,
                          cursor: 'pointer', transition: 'all .15s'
                        }}
                        onClick={() => handleToggleModel(provider.id, model.id, model.enabled)}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{model.name}</span>
                          <div style={{
                            width: 36, height: 20, borderRadius: 10,
                            background: model.enabled ? '#2A83FF' : '#cbd5e1',
                            position: 'relative', transition: 'background .2s', flexShrink: 0
                          }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: '50%', background: 'white',
                              position: 'absolute', top: 2, left: model.enabled ? 18 : 2, transition: 'left .2s'
                            }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, color: cat.color, background: cat.bg }}>
                            {cat.label}
                          </span>
                          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                            {formatWindow(model.contextWindow)} ctx
                          </span>
                          <span style={{ fontSize: 10, color: '#cbd5e1' }}>|</span>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            max {formatWindow(model.maxTokens)}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 10, color: '#cbd5e1', fontFamily: 'monospace' }}>
                          {model.id}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    border: '2px dashed #e2e8f0', background: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', minHeight: 80,
                    color: '#94a3b8', fontSize: 13, fontWeight: 500
                  }}
                    onClick={() => {
                      setAddingModel(provider.id);
                      setNewModelForm({ id: '', name: '', maxTokens: 4096, contextWindow: 8192 });
                    }}>
                    ＋ 添加模型
                  </div>
                </div>
              </div>
            </div>
          ))}

          {providers.length === 0 && (
            <div className="empty-state card">
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
              <h3>暂无模型厂商</h3>
              <p>请在后端配置至少一个模型服务厂商</p>
            </div>
          )}
        </div>
      )}

      {/* Add model modal */}
      {addingModel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setAddingModel(null); }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }}>
            <h3 style={{ marginTop: 0 }}>添加自定义模型</h3>
            <div className="form-group">
              <label className="form-label">模型 ID *</label>
              <input className="form-input" value={newModelForm.id}
                onChange={e => setNewModelForm(f => ({ ...f, id: e.target.value }))}
                placeholder="例如: gpt-4o" />
            </div>
            <div className="form-group">
              <label className="form-label">显示名称 *</label>
              <input className="form-input" value={newModelForm.name}
                onChange={e => setNewModelForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例如: GPT-4o" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">最大 Token</label>
                <input className="form-input" type="number" value={newModelForm.maxTokens}
                  onChange={e => setNewModelForm(f => ({ ...f, maxTokens: parseInt(e.target.value) || 4096 }))} />
              </div>
              <div className="form-group">
                <label className="form-label">上下文窗口</label>
                <input className="form-input" type="number" value={newModelForm.contextWindow}
                  onChange={e => setNewModelForm(f => ({ ...f, contextWindow: parseInt(e.target.value) || 8192 }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setAddingModel(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleAddModel}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
