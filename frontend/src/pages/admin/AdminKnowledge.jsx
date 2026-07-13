import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { knowledgeAPI } from '../../api';
import { Modal, ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';

const KB_TYPES = {
  document: { label: '文本文档', icon: '📄', color: '#3b82f6' },
  faq: { label: 'FAQ知识库', icon: '❓', color: '#2A83FF' },
  structured: { label: '结构化文本', icon: '📊', color: '#10b981' },
  graph: { label: '图知识库', icon: '🔗', color: '#f59e0b' }
};

export default function AdminKnowledge() {
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', type: 'document' });
  const [keyword, setKeyword] = useState('');
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await knowledgeAPI.list({ keyword: keyword || undefined });
      setLibraries(res.data.libraries || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error('请填写知识库名称');
    try {
      await knowledgeAPI.create(form);
      toast.success('知识库创建成功');
      setShowCreate(false);
      setForm({ name: '', description: '', type: 'document' });
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handlePublish = async (kb) => {
    try {
      if (kb.status === 'published') {
        await knowledgeAPI.unpublish(kb.id);
        toast.success('知识库已下线');
      } else {
        await knowledgeAPI.publish(kb.id);
        toast.success('知识库已发布');
      }
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    try {
      await knowledgeAPI.delete(deleteConfirm.id);
      toast.success('知识库已删除');
      setDeleteConfirm(null);
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>📚 知识库管理</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>管理智能体的知识数据源</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="form-input" style={{ width: 200 }} placeholder="搜索知识库..." value={keyword}
            onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadData()} />
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ 创建知识库</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : libraries.length === 0 ? (
        <div className="empty-state card">
          <div style={{ fontSize: 56, marginBottom: 12 }}>📚</div>
          <h3>暂无知识库</h3>
          <p>点击右上角「创建知识库」开始添加</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {libraries.map(kb => {
            const typeInfo = KB_TYPES[kb.type] || KB_TYPES.document;
            return (
              <div key={kb.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: typeInfo.color + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
                  }}>
                    {typeInfo.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{kb.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="tag tag-primary" style={{ fontSize: 11, background: typeInfo.color + '22', color: typeInfo.color }}>
                        {typeInfo.label}
                      </span>
                      <span className={`tag ${kb.status === 'published' ? 'tag-success' : 'tag-gray'}`} style={{ fontSize: 11 }}>
                        {kb.status === 'published' ? '● 已发布' : '○ 草稿'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {kb.description && (
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{kb.description}</p>
                )}
                
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {kb.type === 'graph'
                    ? `🔗 ${kb.graphData?.entities?.length || 0} 实体, ${kb.graphData?.relations?.length || 0} 关系`
                    : `📎 ${kb.documents?.length || 0} 个文档`
                  } · {new Date(kb.updatedAt).toLocaleDateString()}
                </div>
                
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/admin/knowledge/${kb.id}`)} style={{ flex: 1 }}>
                    📁 管理
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handlePublish(kb)}
                    style={{ flex: 1, color: kb.status === 'published' ? '#f59e0b' : '#10b981' }}
                  >
                    {kb.status === 'published' ? '⬇ 下线' : '⬆ 发布'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(kb)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="创建知识库" onClose={() => setShowCreate(false)} footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleCreate}>创建</button>
          </>
        } width="460px">
          <div className="form-group">
            <label className="form-label">知识库名称 *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="请输入名称" />
          </div>
          <div className="form-group">
            <label className="form-label">知识库类型 *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {Object.entries(KB_TYPES).map(([type, info]) => (
                <button
                  key={type}
                  onClick={() => setForm(p => ({ ...p, type }))}
                  style={{
                    padding: '12px 8px', borderRadius: 10, border: '2px solid',
                    borderColor: form.type === type ? info.color : '#e2e8f0',
                    background: form.type === type ? info.color + '15' : 'white',
                    cursor: 'pointer', textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{info.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: form.type === type ? info.color : '#64748b' }}>{info.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">描述</label>
            <textarea className="form-textarea" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="可选描述" />
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="删除知识库"
          message={`确定要删除知识库「${deleteConfirm.name}」吗？其中所有文档将一并删除。`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
          danger
        />
      )}
    </div>
  );
}
