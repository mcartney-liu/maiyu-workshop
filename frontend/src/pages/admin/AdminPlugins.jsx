import React, { useState, useEffect } from 'react';
import { pluginAPI } from '../../api';
import { Modal, ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';

const TABS = [
  { id: 'http', label: '🔌 HTTP插件' },
  { id: 'mcp', label: '🔗 MCP服务器' },
  { id: 'lightapp', label: '📱 轻应用插件' },
  { id: 'builtin', label: '📦 内置插件' },
  { id: 'usage', label: '📊 使用统计' }
];

export default function AdminPlugins() {
  const [activeTab, setActiveTab] = useState('http');
  const toast = useToast();

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>🔌 插件库管理</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>管理HTTP接口插件、MCP服务器、轻应用，并查看使用统计</p>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: 20, display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0, overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.id}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: activeTab === tab.id ? 600 : 400, whiteSpace: 'nowrap' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'http' && <HttpPluginsPanel toast={toast} />}
      {activeTab === 'mcp' && <McpServersPanel toast={toast} />}
      {activeTab === 'lightapp' && <LightAppsPanel toast={toast} />}
      {activeTab === 'builtin' && <BuiltinPanel toast={toast} />}
      {activeTab === 'usage' && <UsagePanel toast={toast} />}
    </div>
  );
}

// ======================== HTTP Plugins ========================
function HttpPluginsPanel({ toast }) {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editPlugin, setEditPlugin] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [testInfo, setTestInfo] = useState(null); // { plugin, result, testing }
  const [form, setForm] = useState({ name: '', description: '', type: 'http', config: { method: 'POST', url: '', headers: {}, params: [], auth: { type: 'none' } } });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try { const res = await pluginAPI.list(); setPlugins(res.data.plugins || []); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('请填写插件名称');
    if (!form.config.url?.trim()) return toast.error('请填写接口地址');
    try {
      if (editPlugin) { await pluginAPI.update(editPlugin.id, form); toast.success('插件已更新'); }
      else { await pluginAPI.create(form); toast.success('插件创建成功'); }
      setShowCreate(false); setEditPlugin(null);
      setForm({ name: '', description: '', type: 'http', config: { method: 'POST', url: '', headers: {}, params: [], auth: { type: 'none' } } });
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handlePublish = async (p) => {
    try {
      if (p.status === 'published') { await pluginAPI.unpublish(p.id); toast.success('已下线'); }
      else { await pluginAPI.publish(p.id); toast.success('已发布'); }
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    try { await pluginAPI.delete(deleteConfirm.id); toast.success('已删除'); setDeleteConfirm(null); loadData(); } catch (e) { toast.error(e.message); }
  };

  const handleTest = async (p) => {
    setTestInfo({ plugin: p, testing: true, result: null });
    try {
      const res = await pluginAPI.test(p.id, { query: '测试' });
      setTestInfo({ plugin: p, testing: false, result: res.data });
    } catch (e) {
      setTestInfo({ plugin: p, testing: false, result: { success: false, error: e.message } });
    }
  };

  const openEdit = (p) => { setEditPlugin(p); setForm({ name: p.name, description: p.description, type: p.type, config: { ...p.config } }); setShowCreate(true); };

  const addParam = () => { setForm(p => ({ ...p, config: { ...p.config, params: [...(p.config.params || []), { name: '', type: 'string', required: false, description: '' }] } })); };
  const updateParam = (i, field, value) => { const params = [...(form.config.params || [])]; params[i] = { ...params[i], [field]: value }; setForm(p => ({ ...p, config: { ...p.config, params } })); };

  const pluginResultSummary = (result) => {
    if (result.success) return <span style={{ color: '#10b981', fontWeight: 600 }}>✅ 成功 (HTTP {result.statusCode}, {result.elapsed}ms)</span>;
    return <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ 失败: {result.error}</span>;
  };

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={() => { setShowCreate(true); setEditPlugin(null); setForm({ name: '', description: '', type: 'http', config: { method: 'POST', url: '', headers: {}, params: [], auth: { type: 'none' } } }); }}>+ 添加插件</button>
      </div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div> :
        plugins.length === 0 ? <div className="empty-state card"><div style={{ fontSize: 56, marginBottom: 12 }}>🔌</div><h3>暂无插件</h3><p>添加HTTP接口插件，让智能体能够调用外部业务系统</p></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {plugins.map(p => (
            <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔌</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <span className={`tag ${p.status === 'published' ? 'tag-success' : 'tag-gray'}`} style={{ fontSize: 11 }}>
                    {p.status === 'published' ? '● 已发布' : '○ 草稿'}
                  </span>
                  <span className="tag" style={{ marginLeft: 4, fontSize: 11, background: '#e0f2fe', color: '#0284c7' }}>
                    {p.config?.method || 'POST'}
                  </span>
                </div>
              </div>
              {p.description && <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>{p.description}</p>}
              <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#f8fafc', padding: '4px 8px', borderRadius: 4 }}>
                {p.config?.method} {p.config?.url || '(未配置URL)'}
              </div>
              {(p.config?.params || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(p.config.params || []).map((pr, i) => (
                    <span key={i} style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 10 }}>
                      {pr.name}{pr.required ? ' *' : ''}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)} style={{ flex: 1 }}>⚙️ 编辑</button>
                <button className="btn btn-outline btn-sm" onClick={() => handlePublish(p)} style={{ flex: 1, color: p.status === 'published' ? '#f59e0b' : '#10b981' }}>{p.status === 'published' ? '⬇ 下线' : '⬆ 发布'}</button>
                <button className="btn btn-outline btn-sm" onClick={() => handleTest(p)} style={{ color: '#2A83FF' }} title="测试插件">🧪</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(p)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test Result Modal */}
      {testInfo && (
        <Modal title={`🧪 测试: ${testInfo.plugin.name}`} onClose={() => setTestInfo(null)} width="620px">
          {testInfo.testing ? (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: '#64748b' }}>正在调用 {testInfo.plugin.config?.method} {testInfo.plugin.config?.url} ...</p>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 14, fontSize: 14 }}>{pluginResultSummary(testInfo.result)}</div>
              {testInfo.result.statusCode && (
                <div className="form-group">
                  <label className="form-label">响应状态</label>
                  <div style={{ fontFamily: 'monospace', fontSize: 13 }}>HTTP {testInfo.result.statusCode} · {testInfo.result.elapsed}ms</div>
                </div>
              )}
              {testInfo.result.data !== undefined && (
                <div className="form-group">
                  <label className="form-label">响应数据</label>
                  <pre style={{
                    background: '#1e293b', color: '#e2e8f0', padding: 14, borderRadius: 8,
                    fontSize: 12, maxHeight: 350, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0
                  }}>
                    {typeof testInfo.result.data === 'string' ? testInfo.result.data : JSON.stringify(testInfo.result.data, null, 2)}
                  </pre>
                </div>
              )}
              {testInfo.result.error && (
                <div className="form-group">
                  <label className="form-label">错误信息</label>
                  <div style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{testInfo.result.error}</div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <Modal title={editPlugin ? '编辑插件' : '添加插件'} onClose={() => { setShowCreate(false); setEditPlugin(null); }} footer={<><button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button><button className="btn btn-primary" onClick={handleSave}>保存</button></>} width="580px">
          <div className="form-group"><label className="form-label">插件名称 *</label><input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="例如：天气查询" /></div>
          <div className="form-group"><label className="form-label">插件描述</label><textarea className="form-textarea" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="描述插件用途" /></div>
          <div style={{ display: 'flex', gap: 12 }}><div className="form-group" style={{ width: 100 }}><label className="form-label">请求方式</label><select className="form-select" value={form.config?.method || 'POST'} onChange={e => setForm(p => ({ ...p, config: { ...p.config, method: e.target.value } }))}><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option></select></div>
            <div className="form-group" style={{ flex: 1 }}><label className="form-label">接口地址 *</label><input className="form-input" value={form.config?.url || ''} onChange={e => setForm(p => ({ ...p, config: { ...p.config, url: e.target.value } }))} placeholder="https://api.example.com/endpoint" /></div></div>
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>参数列表</label>
              <button className="btn btn-outline btn-sm" onClick={addParam}>+ 添加</button>
            </div>
            {(form.config?.params || []).map((param, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input className="form-input" style={{ flex: 1 }} value={param.name} onChange={e => updateParam(i, 'name', e.target.value)} placeholder="参数名" />
                <select className="form-select" style={{ width: 100 }} value={param.type} onChange={e => updateParam(i, 'type', e.target.value)}>
                  <option value="string">string</option><option value="number">number</option><option value="boolean">boolean</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={param.required} onChange={e => updateParam(i, 'required', e.target.checked)} />必填
                </label>
                <button onClick={() => {
                  const params = form.config.params.filter(function(_, j) { return j !== i; });
                  setForm(function(p) { return { ...p, config: { ...p.config, params: params } }; });
                }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18 }}>×</button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {deleteConfirm && <ConfirmModal title="删除插件" message={`确定删除「${deleteConfirm.name}」？此操作不可恢复。`} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} danger />}
    </>
  );
}

// ======================== MCP Servers ========================
function McpServersPanel({ toast }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [form, setForm] = useState({ name: '', description: '', type: 'stdio', command: '', args: '', url: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const res = await pluginAPI.listMcp(); setServers(res.data.mcpServers || []); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('名称不能为空');
    if (form.type === 'stdio' && !form.command.trim()) return toast.error('命令不能为空');
    if (form.type === 'sse' && !form.url.trim()) return toast.error('URL不能为空');
    try {
      const payload = { name: form.name, description: form.description, command: form.command, args: form.args.split(' ').filter(Boolean), url: form.url };
      if (form.type === 'sse') { payload.url = form.url; payload.command = ''; payload.args = []; }
      if (editServer) { await pluginAPI.updateMcp(editServer.id, payload); toast.success('已更新'); }
      else { await pluginAPI.createMcp(payload); toast.success('已添加'); }
      setShowForm(false); setEditServer(null);
      setForm({ name: '', description: '', type: 'stdio', command: '', args: '', url: '' });
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handlePublish = async (s) => {
    try { await pluginAPI.publishMcp(s.id); toast.success('已发布'); load(); } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    try { await pluginAPI.deleteMcp(deleteConfirm.id); toast.success('已删除'); setDeleteConfirm(null); load(); } catch (e) { toast.error(e.message); }
  };

  const handleTest = async (s) => {
    setTestingId(s.id);
    try {
      const res = await pluginAPI.testMcp(s.id);
      setTestResults({ ...testResults, [s.id]: res.data });
    } catch (e) {
      setTestResults({ ...testResults, [s.id]: { success: false, error: e.message } });
    }
    setTestingId(null);
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}><button className="btn btn-primary" onClick={() => { setEditServer(null); setForm({ name: '', description: '', type: 'stdio', command: '', args: '', url: '' }); setShowForm(true); }}>+ 添加MCP服务器</button></div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div> :
        servers.length === 0 ? <div className="empty-state card"><div style={{ fontSize: 56 }}>🔗</div><h3>暂无MCP服务器</h3><p>添加MCP服务器，扩展智能体的工具能力</p></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {servers.map(s => {
            const tr = testResults[s.id];
            return (
              <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔗</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                      <span className={`tag ${s.status === 'published' ? 'tag-success' : 'tag-gray'}`} style={{ fontSize: 11 }}>{s.status === 'published' ? '● 已发布' : '○ 草稿'}</span>
                      <span className="tag" style={{ fontSize: 11, background: '#e0f2fe', color: '#0284c7' }}>{s.type === 'sse' ? 'SSE' : 'STDIO'}</span>
                    </div>
                  </div>
                </div>
                {s.description && <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{s.description}</p>}
                {s.type === 'stdio' && s.config?.command && (
                  <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', background: '#f8fafc', padding: '4px 8px', borderRadius: 4 }}>
                    $ {s.config.command} {(s.config.args || []).join(' ')}
                  </div>
                )}
                {s.type === 'sse' && s.config?.url && (
                  <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    🔗 {s.config.url}
                  </div>
                )}
                {tr && (
                  <div style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, background: tr.success ? '#f0fdf4' : '#fef2f2', color: tr.success ? '#166534' : '#991b1b' }}>
                    {tr.success ? `✅ ${tr.message || '连接成功'} (${tr.elapsed || 0}ms)` : `❌ ${tr.error || '连接失败'}`}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => { setEditServer(s); setForm({ name: s.name, description: s.description, type: s.type, command: s.config?.command || '', args: (s.config?.args || []).join(' '), url: s.config?.url || '' }); setShowForm(true); }} style={{ flex: 1 }}>⚙️ 编辑</button>
                  <button className="btn btn-outline btn-sm" onClick={() => handlePublish(s)} style={{ flex: 1, color: '#10b981' }}>⬆ 发布</button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleTest(s)} style={{ color: '#2A83FF' }} title="测试连接" disabled={testingId === s.id}>
                    {testingId === s.id ? '⏳' : '🧪'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(s)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showForm && (
        <Modal title={editServer ? '编辑MCP服务器' : '添加MCP服务器'} onClose={() => setShowForm(false)}
          footer={<><button className="btn btn-outline" onClick={() => setShowForm(false)}>取消</button><button className="btn btn-primary" onClick={handleSave}>保存</button></>} width="500px">
          <div className="form-group"><label className="form-label">名称 *</label><input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="例如：文件系统服务器" /></div>
          <div className="form-group"><label className="form-label">描述</label><textarea className="form-textarea" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="服务器功能描述" /></div>
          <div className="form-group"><label className="form-label">类型</label><select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}><option value="stdio">STDIO</option><option value="sse">SSE</option></select></div>
          {form.type === 'stdio' && (<><div className="form-group"><label className="form-label">命令 *</label><input className="form-input" value={form.command} onChange={e => setForm(p => ({ ...p, command: e.target.value }))} placeholder="例如：npx 或 python" /></div>
            <div className="form-group"><label className="form-label">参数（空格分隔）</label><input className="form-input" value={form.args} onChange={e => setForm(p => ({ ...p, args: e.target.value }))} placeholder="例如：@modelcontextprotocol/server-filesystem /path" /></div></>)}
          {form.type === 'sse' && <div className="form-group"><label className="form-label">URL *</label><input className="form-input" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://mcp-server.example.com/sse" /></div>}
        </Modal>
      )}
      {deleteConfirm && <ConfirmModal title="删除MCP服务器" message={`确定删除「${deleteConfirm.name}」？`} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} danger />}
    </>
  );
}

// ======================== Light Apps ========================
function LightAppsPanel({ toast }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editApp, setEditApp] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', endpoint: '', icon: '📱' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const res = await pluginAPI.listLightApps(); setApps(res.data.lightApps || []); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.endpoint.trim()) return toast.error('名称和端点不能为空');
    try {
      if (editApp) { await pluginAPI.updateLightApp(editApp.id, { name: form.name, description: form.description, endpoint: form.endpoint, icon: form.icon }); toast.success('已更新'); }
      else { await pluginAPI.createLightApp({ name: form.name, description: form.description, endpoint: form.endpoint, icon: form.icon }); toast.success('已添加'); }
      setShowForm(false); setEditApp(null); setForm({ name: '', description: '', endpoint: '', icon: '📱' }); load();
    } catch (e) { toast.error(e.message); }
  };

  const handlePublish = async (a) => { try { await pluginAPI.publishLightApp(a.id); toast.success('已发布'); load(); } catch (e) { toast.error(e.message); } };
  const handleDelete = async () => { try { await pluginAPI.deleteLightApp(deleteConfirm.id); toast.success('已删除'); setDeleteConfirm(null); load(); } catch (e) { toast.error(e.message); } };

  return (
    <>
      <div style={{ marginBottom: 16 }}><button className="btn btn-primary" onClick={() => { setEditApp(null); setForm({ name: '', description: '', endpoint: '', icon: '📱' }); setShowForm(true); }}>+ 添加轻应用</button></div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div> :
        apps.length === 0 ? <div className="empty-state card"><div style={{ fontSize: 56 }}>📱</div><h3>暂无轻应用</h3><p>添加轻应用插件，将外部应用快速接入</p></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {apps.map(a => (
            <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{a.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <span className={`tag ${a.status === 'published' ? 'tag-success' : 'tag-gray'}`} style={{ fontSize: 11, marginTop: 2, display: 'inline-block' }}>{a.status === 'published' ? '● 已发布' : '○ 草稿'}</span>
                </div>
              </div>
              {a.description && <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{a.description}</p>}
              <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>📡 {a.endpoint}</div>
              <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <button className="btn btn-outline btn-sm" onClick={() => { setEditApp(a); setForm({ name: a.name, description: a.description, endpoint: a.endpoint, icon: a.icon }); setShowForm(true); }} style={{ flex: 1 }}>⚙️ 编辑</button>
                <button className="btn btn-outline btn-sm" onClick={() => handlePublish(a)} style={{ flex: 1, color: '#10b981' }}>⬆ 发布</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(a)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <Modal title={editApp ? '编辑轻应用' : '添加轻应用'} onClose={() => setShowForm(false)}
          footer={<><button className="btn btn-outline" onClick={() => setShowForm(false)}>取消</button><button className="btn btn-primary" onClick={handleSave}>保存</button></>} width="500px">
          <div className="form-group"><label className="form-label">图标</label><input className="form-input" value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} placeholder="📱" /></div>
          <div className="form-group"><label className="form-label">名称 *</label><input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="轻应用名称" /></div>
          <div className="form-group"><label className="form-label">描述</label><input className="form-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="功能描述" /></div>
          <div className="form-group"><label className="form-label">端点 *</label><input className="form-input" value={form.endpoint} onChange={e => setForm(p => ({ ...p, endpoint: e.target.value }))} placeholder="https://app.example.com/api/qa" /></div>
        </Modal>
      )}
      {deleteConfirm && <ConfirmModal title="删除轻应用" message={`确定删除「${deleteConfirm.name}」？`} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} danger />}
    </>
  );
}

// ======================== Builtin ========================
function BuiltinPanel({ toast }) {
  const [builtin, setBuiltin] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const res = await pluginAPI.listBuiltin(); setBuiltin(res.data.builtin || []); } catch (e) {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>;

  return (
    <div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
        内置插件为系统预置的基础能力插件，可直接在智能体配置中启用，无需额外配置。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {builtin.map(p => (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{p.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================== Usage Stats ========================
function UsagePanel({ toast }) {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await pluginAPI.getUsage();
        setUsage(res.data.usage || {});
      } catch (e) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>;

  const entries = Object.values(usage).sort((a, b) => b.totalCalls - a.totalCalls);
  const totalCalls = entries.reduce((s, e) => s + e.totalCalls, 0);
  const totalSuccess = entries.reduce((s, e) => s + e.successCalls, 0);

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#2A83FF' }}>{entries.length}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>使用中的插件</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0ea5e9' }}>{totalCalls}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>总调用次数</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#10b981' }}>{totalCalls > 0 ? Math.round(totalSuccess / totalCalls * 100) : 0}%</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>成功率</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>
            {totalCalls > 0 ? Math.round(entries.reduce((s, e) => s + e.totalElapsed, 0) / totalCalls) : 0}ms
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>平均耗时</div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state card" style={{ padding: 30 }}>
          <div style={{ fontSize: 56 }}>📊</div>
          <h3>暂无使用数据</h3>
          <p>插件被调用后，使用数据将在此处展示</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>插件名称</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>调用次数</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>成功</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>失败</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>成功率</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>平均耗时</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>最近调用</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fafbfc' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{e.name}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#2A83FF' }}>{e.totalCalls}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#10b981' }}>{e.successCalls}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#ef4444' }}>{e.failCalls}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ color: e.totalCalls > 0 && (e.successCalls / e.totalCalls >= 0.9) ? '#10b981' : e.totalCalls > 0 ? '#f59e0b' : '#94a3b8', fontWeight: 600 }}>
                      {e.totalCalls > 0 ? Math.round(e.successCalls / e.totalCalls * 100) : 0}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                    {e.totalCalls > 0 ? Math.round(e.totalElapsed / e.totalCalls) : 0}ms
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>
                    {e.lastCall ? new Date(e.lastCall).toLocaleString('zh-CN') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
