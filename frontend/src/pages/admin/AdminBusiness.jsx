import React, { useState, useEffect } from 'react';
import { businessAPI } from '../../api';
import { Modal, ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';

const TABS = [
  { id: 'terms', label: '📖 知识名词' },
  { id: 'dicts', label: '📕 字典数据' },
  { id: 'samples', label: '📋 样例数据' },
  { id: 'metrics', label: '📊 运营指标' }
];

export default function AdminBusiness() {
  const [activeTab, setActiveTab] = useState('terms');
  const toast = useToast();

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>业务知识管理</h2>
        <p className="page-desc">管理知识名词解释、字典数据、样例数据和运营指标</p>
      </div>

      <div className="tab-bar" style={{ marginBottom: 20, display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button key={tab.id}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 14,
              borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'terms' && <TermsPanel toast={toast} />}
      {activeTab === 'dicts' && <DictionariesPanel toast={toast} />}
      {activeTab === 'samples' && <SamplesPanel toast={toast} />}
      {activeTab === 'metrics' && <MetricsPanel toast={toast} />}
    </div>
  );
}

// ======================== Terms Panel ========================
function TermsPanel({ toast }) {
  const [terms, setTerms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTerm, setEditTerm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', definition: '', category: '', aliases: '' });

  useEffect(() => { load(); }, [filterCat]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await businessAPI.listTerms({ keyword, category: filterCat });
      setTerms(res.data.terms || []);
      setCategories(res.data.categories || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.definition.trim()) return toast.error('名称和定义不能为空');
    try {
      const payload = { ...form, aliases: form.aliases.split(',').map(s => s.trim()).filter(Boolean) };
      if (editTerm) {
        await businessAPI.updateTerm(editTerm.id, payload);
        toast.success('术语已更新');
      } else {
        await businessAPI.createTerm(payload);
        toast.success('术语已添加');
      }
      setShowForm(false); setEditTerm(null);
      setForm({ name: '', definition: '', category: '', aliases: '' });
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    try { await businessAPI.deleteTerm(deleteConfirm.id); toast.success('已删除'); setDeleteConfirm(null); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" placeholder="搜索术语..." value={keyword} onChange={e => { setKeyword(e.target.value); }}
          onKeyDown={e => e.key === 'Enter' && load()} style={{ width: 240 }} />
        <select className="form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 140 }}>
          <option value="">全部分类</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-outline btn-sm" onClick={load}>🔍 搜索</button>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditTerm(null); setForm({ name: '', definition: '', category: '', aliases: '' }); setShowForm(true); }}>+ 添加术语</button>
      </div>

      {loading ? <div className="loading">加载中...</div> :
        terms.length === 0 ? <div className="empty-state card"><p>暂无知识名词，点击"添加术语"开始</p></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {terms.map(term => (
            <div key={term.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 15 }}>{term.name}</strong>
                  <span className="tag">{term.category}</span>
                  {term.aliases?.length > 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>别名: {term.aliases.join(', ')}</span>}
                </div>
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{term.definition}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-outline btn-sm" onClick={() => {
                  setEditTerm(term); setForm({ name: term.name, definition: term.definition, category: term.category, aliases: (term.aliases || []).join(', ') });
                  setShowForm(true);
                }}>✎</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(term)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editTerm ? '编辑术语' : '添加术语'} onClose={() => { setShowForm(false); setEditTerm(null); }}
          footer={<><button className="btn btn-outline" onClick={() => setShowForm(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSave}>保存</button></>} width="500px">
          <div className="form-group"><label className="form-label">名称 *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="例如：数据血缘" /></div>
          <div className="form-group"><label className="form-label">定义 *</label>
            <textarea className="form-textarea" rows={4} value={form.definition} onChange={e => setForm(p => ({ ...p, definition: e.target.value }))} placeholder="术语的详细定义和解释" /></div>
          <div className="form-group"><label className="form-label">分类</label>
            <input className="form-input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="例如：数据治理" /></div>
          <div className="form-group"><label className="form-label">别名（逗号分隔）</label>
            <input className="form-input" value={form.aliases} onChange={e => setForm(p => ({ ...p, aliases: e.target.value }))} placeholder="例如：data lineage, 数据沿袭" /></div>
        </Modal>
      )}
      {deleteConfirm && <ConfirmModal title="删除术语" message={`确定删除「${deleteConfirm.name}」？`} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} danger />}
    </div>
  );
}

// ======================== Dictionaries Panel ========================
function DictionariesPanel({ toast }) {
  const [dicts, setDicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editDict, setEditDict] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', entriesText: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const res = await businessAPI.listDictionaries(); setDicts(res.data.dictionaries || []); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('名称不能为空');
    try {
      const entries = form.entriesText.split('\n').filter(l => l.trim()).map(l => {
        const [key, ...val] = l.split('=');
        return { key: key.trim(), value: val.join('=').trim() };
      });
      const payload = { name: form.name, description: form.description, entries };
      if (editDict) { await businessAPI.updateDictionary(editDict.id, payload); toast.success('已更新'); }
      else { await businessAPI.createDictionary(payload); toast.success('已创建'); }
      setShowForm(false); setEditDict(null);
      setForm({ name: '', description: '', entriesText: '' });
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    try { await businessAPI.deleteDictionary(deleteConfirm.id); toast.success('已删除'); setDeleteConfirm(null); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditDict(null); setForm({ name: '', description: '', entriesText: '' }); setShowForm(true); }}>+ 添加字典</button>
      </div>

      {loading ? <div className="loading">加载中...</div> :
        dicts.length === 0 ? <div className="empty-state card"><p>暂无字典数据</p></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dicts.map(dict => (
            <div key={dict.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div><strong>{dict.name}</strong>
                  {dict.description && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{dict.description}</span>}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => {
                    setEditDict(dict); setForm({ name: dict.name, description: dict.description, entriesText: (dict.entries || []).map(e => `${e.key}=${e.value}`).join('\n') });
                    setShowForm(true);
                  }}>✎</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(dict)}>×</button>
                </div>
              </div>
              <div className="detail-row"><span className="detail-label">条目数</span><span className="detail-value">{(dict.entries || []).length} 条</span></div>
              <div style={{ fontSize: 13, color: '#64748b', maxHeight: 120, overflow: 'auto', marginTop: 8 }}>
                {(dict.entries || []).slice(0, 10).map((e, i) => (
                  <div key={i} style={{ padding: '3px 0', display: 'flex' }}>
                    <code style={{ minWidth: 100, color: 'var(--primary-dark)' }}>{e.key}</code>
                    <span>= {e.value}</span>
                  </div>
                ))}
                {(dict.entries || []).length > 10 && <div style={{ color: '#94a3b8' }}>... 还有 {dict.entries.length - 10} 条</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editDict ? '编辑字典' : '添加字典'} onClose={() => setShowForm(false)}
          footer={<><button className="btn btn-outline" onClick={() => setShowForm(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSave}>保存</button></>} width="500px">
          <div className="form-group"><label className="form-label">名称 *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="例如：部门编码" /></div>
          <div className="form-group"><label className="form-label">描述</label>
            <input className="form-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="字典用途说明" /></div>
          <div className="form-group"><label className="form-label">条目（每行一条，key=value格式）</label>
            <textarea className="form-textarea" rows={8} value={form.entriesText} onChange={e => setForm(p => ({ ...p, entriesText: e.target.value }))} placeholder="D001=技术部&#10;D002=财务部" /></div>
        </Modal>
      )}
      {deleteConfirm && <ConfirmModal title="删除字典" message={`确定删除「${deleteConfirm.name}」？`} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} danger />}
    </div>
  );
}

// ======================== Samples Panel ========================
function SamplesPanel({ toast }) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', content: '', type: 'text' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const res = await businessAPI.listSamples(); setSamples(res.data.samples || []); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) return toast.error('名称和内容不能为空');
    try { await businessAPI.createSample(form); toast.success('已添加'); setShowForm(false); setForm({ name: '', description: '', content: '', type: 'text' }); load(); }
    catch (e) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    try { await businessAPI.deleteSample(deleteConfirm.id); toast.success('已删除'); setDeleteConfirm(null); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({ name: '', description: '', content: '', type: 'text' }); setShowForm(true); }}>+ 添加样例</button>
      </div>
      {loading ? <div className="loading">加载中...</div> :
        samples.length === 0 ? <div className="empty-state card"><p>暂无样例数据</p></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {samples.map(sample => (
            <div key={sample.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 15 }}>{sample.name}</strong>
                {sample.description && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{sample.description}</span>}
                <pre style={{ marginTop: 8, padding: 10, background: '#1e293b', color: '#e2e8f0', borderRadius: 6, fontSize: 12, maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{sample.content}</pre>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(sample)} style={{ flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <Modal title="添加样例数据" onClose={() => setShowForm(false)}
          footer={<><button className="btn btn-outline" onClick={() => setShowForm(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSave}>保存</button></>} width="500px">
          <div className="form-group"><label className="form-label">名称 *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="样例名称" /></div>
          <div className="form-group"><label className="form-label">描述</label>
            <input className="form-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="说明" /></div>
          <div className="form-group"><label className="form-label">类型</label>
            <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="text">文本</option><option value="sql">SQL</option><option value="json">JSON</option><option value="code">代码</option></select></div>
          <div className="form-group"><label className="form-label">内容 *</label>
            <textarea className="form-textarea" rows={10} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="粘贴样例内容" /></div>
        </Modal>
      )}
      {deleteConfirm && <ConfirmModal title="删除样例" message={`确定删除「${deleteConfirm.name}」？`} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} danger />}
    </div>
  );
}

// ======================== Metrics Panel ========================
function MetricsPanel({ toast }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const res = await businessAPI.getMetrics(); setMetrics(res.data); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (!metrics) return null;

  const cards = [
    { icon: '💬', label: '今日消息', value: metrics.todayMessages, cls: 'primary' },
    { icon: '👥', label: '活跃用户', value: metrics.activeUsers, cls: 'success' },
    { icon: '⏱️', label: '平均响应(秒)', value: metrics.avgResponseTime, cls: 'warning' },
    { icon: '⭐', label: '满意度%', value: metrics.satisfactionRate, cls: 'info' },
  ];

  return (
    <div>
      <div className="metrics-grid" style={{ marginBottom: 24 }}>
        {cards.map((card, i) => (
          <div key={i} className={`metric-card ${card.cls}`}>
            <div className="metric-icon">{card.icon}</div>
            <div className="metric-info">
              <div className="metric-value">{card.value}</div>
              <div className="metric-label">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📈 本周消息趋势</h3>
        <div className="chart-placeholder">
          <div className="bar-chart">
            {(metrics.weeklyTrend || []).map((day, i) => {
              const maxVal = Math.max(...(metrics.weeklyTrend || []).map(d => d.count), 1);
              const height = Math.max(8, (day.count / maxVal) * 140);
              const isToday = i === (metrics.weeklyTrend || []).length - 1;
              return (
                <div key={i} className="bar-item">
                  <div className={`bar ${isToday ? 'highlight' : ''}`} style={{ height }}>
                    <span className="bar-value">{day.count}</span>
                  </div>
                  <span className="bar-label">{day.date?.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
