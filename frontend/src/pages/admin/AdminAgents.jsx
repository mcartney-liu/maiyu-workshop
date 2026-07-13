import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentAPI } from '../../api';
import { Modal, ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';

const AVATARS = ['🤖', '🦾', '🧠', '💡', '🔮', '🌟', '🎯', '🚀', '💎', '🦋', '🌈', '⚡', '🔥', '🌊', '🎭'];

export default function AdminAgents() {
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCatCreate, setShowCatCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetCat, setMoveTargetCat] = useState('');
  const [batchConfirm, setBatchConfirm] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', type: 'chat', buildMode: 'simple',
    categoryId: '', avatar: '🤖'
  });
  const [catForm, setCatForm] = useState({ name: '', parentId: '' });
  
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, [selectedCat]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCat !== 'all') params.categoryId = selectedCat;
      
      const [agentRes, catRes] = await Promise.all([
        agentAPI.list(params),
        agentAPI.listCategories()
      ]);
      setAgents(agentRes.data.agents || []);
      setCategories(catRes.data.categories || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error('请填写智能体名称');
    if (!form.categoryId) return toast.error('请选择所属分类');
    
    try {
      const created = await agentAPI.create(form);
      toast.success('智能体创建成功');
      setShowCreate(false);
      setForm({ name: '', description: '', type: 'chat', buildMode: 'simple', categoryId: '', avatar: '🤖' });
      if (form.buildMode === 'workflow') {
        navigate(`/admin/workflow/${created.data.id}`);
      } else {
        loadData();
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleCreateCategory = async () => {
    if (!catForm.name.trim()) return toast.error('请填写分类名称');
    try {
      if (editCat) {
        await agentAPI.updateCategory(editCat.id, catForm);
        toast.success('分类已更新');
      } else {
        await agentAPI.createCategory(catForm);
        toast.success('分类创建成功');
      }
      setShowCatCreate(false);
      setEditCat(null);
      setCatForm({ name: '', parentId: '' });
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDeleteAgent = async () => {
    try {
      await agentAPI.delete(deleteConfirm.id);
      toast.success('智能体已删除');
      setDeleteConfirm(null);
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handlePublish = async (agent) => {
    try {
      if (agent.status === 'published') {
        await agentAPI.unpublish(agent.id);
        toast.success('智能体已下线');
      } else {
        await agentAPI.publish(agent.id);
        toast.success('智能体已发布');
      }
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleCopy = async (agent) => {
    try {
      await agentAPI.copy(agent.id);
      toast.success('智能体已复制');
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === agents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(agents.map(a => a.id)));
    }
  };

  const handleBatchAction = (action) => {
    const ids = [...selectedIds];
    if (action === 'publish') {
      setBatchConfirm({ action: 'publish', msg: `确定要批量发布 ${ids.length} 个智能体吗？` });
    } else if (action === 'unpublish') {
      setBatchConfirm({ action: 'unpublish', msg: `确定要批量下线 ${ids.length} 个智能体吗？` });
    } else if (action === 'delete') {
      setBatchConfirm({ action: 'delete', msg: `⚠️ 确定要批量删除 ${ids.length} 个智能体吗？此操作不可恢复！` });
    }
  };

  const executeBatch = async () => {
    if (!batchConfirm) return;
    try {
      const res = await agentAPI.batch({ action: batchConfirm.action, ids: [...selectedIds] });
      toast.success(`操作成功，影响 ${res.data.count} 个智能体`);
      setSelectedIds(new Set());
      setBatchConfirm(null);
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleBatchMove = async () => {
    if (!moveTargetCat) return toast.error('请选择目标分类');
    try {
      await agentAPI.batch({ action: 'move', ids: [...selectedIds], categoryId: moveTargetCat });
      toast.success(`已移动 ${selectedIds.size} 个智能体`);
      setSelectedIds(new Set());
      setShowMoveModal(false);
      setMoveTargetCat('');
      loadData();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleExport = async () => {
    try {
      const ids = selectedIds.size > 0 ? [...selectedIds] : null;
      const res = await agentAPI.export(ids);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maiyu-agents-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${res.data.count} 个智能体`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.agents || !Array.isArray(data.agents)) {
          return toast.error('无效的导入文件格式');
        }
        const res = await agentAPI.import(data.agents);
        toast.success(`成功导入 ${res.data.imported} 个智能体${res.data.skipped > 0 ? `，跳过 ${res.data.skipped} 个` : ''}`);
        loadData();
      } catch (err) {
        toast.error('导入失败: ' + err.message);
      }
    };
    input.click();
  };

  const topCats = categories.filter(c => !c.parentId);
  const getSubCats = (pid) => categories.filter(c => c.parentId === pid);
  const getAllLeafCats = () => {
    const leafs = [];
    for (const cat of topCats) {
      const subs = getSubCats(cat.id);
      if (subs.length === 0) leafs.push(cat);
      else leafs.push(...subs);
    }
    return leafs;
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>🤖 智能体管理</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>创建和配置您的AI智能体</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={handleImport} title="从JSON文件导入智能体">
            📥 导入
          </button>
          <button className="btn btn-outline" onClick={handleExport} title="导出智能体配置">
            📤 导出{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          <button className="btn btn-outline" onClick={() => setShowCatCreate(true)}>
            📁 新建分类
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + 创建智能体
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Category sidebar */}
        <aside style={{
          width: 200,
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          padding: '12px',
          alignSelf: 'flex-start',
          flexShrink: 0
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8, padding: '0 6px' }}>分类目录</div>
          
          <CategoryItem
            icon="🗂️" label={`全部 (${agents.length})`}
            active={selectedCat === 'all'}
            onClick={() => setSelectedCat('all')}
          />
          
          {topCats.map(cat => {
            const subs = getSubCats(cat.id);
            const catAgentCount = agents.filter(a => {
              if (subs.length > 0) return subs.some(s => s.id === a.categoryId);
              return a.categoryId === cat.id;
            }).length;
            
            return (
              <div key={cat.id}>
                <CategoryItem
                  icon="📁"
                  label={`${cat.name} (${catAgentCount})`}
                  active={selectedCat === cat.id}
                  onClick={() => setSelectedCat(cat.id)}
                  onEdit={() => { setEditCat(cat); setCatForm({ name: cat.name, parentId: cat.parentId || '' }); setShowCatCreate(true); }}
                />
                {subs.map(sub => {
                  const subCount = agents.filter(a => a.categoryId === sub.id).length;
                  return (
                    <CategoryItem
                      key={sub.id}
                      icon="📂"
                      label={`${sub.name} (${subCount})`}
                      active={selectedCat === sub.id}
                      onClick={() => setSelectedCat(sub.id)}
                      indent
                    />
                  );
                })}
              </div>
            );
          })}
        </aside>

        {/* Agent list */}
        <div style={{ flex: 1 }}>
          {/* Batch operations bar */}
          {selectedIds.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', marginBottom: 16,
              background: '#E8F2FF', borderRadius: 10,
              border: '1px solid #bfd7ff'
            }}>
              <input type="checkbox" checked={selectedIds.size === agents.length} onChange={toggleSelectAll}
                style={{ width: 18, height: 18, cursor: 'pointer' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1F6AE0' }}>已选 {selectedIds.size} 项</span>
              <div style={{ flex: 1 }} />
              <button className="btn btn-outline btn-sm" onClick={() => setShowMoveModal(true)} style={{ borderColor: '#a9c7ff', color: '#1F6AE0' }}>
                📁 移动至分类
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleBatchAction('publish')} style={{ borderColor: '#6ee7b7', color: '#059669' }}>
                ⬆ 批量发布
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleBatchAction('unpublish')} style={{ borderColor: '#fcd34d', color: '#d97706' }}>
                ⬇ 批量下线
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleBatchAction('delete')}>
                🗑 批量删除
              </button>
            </div>
          )}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : agents.length === 0 ? (
            <div className="empty-state card">
              <div style={{ fontSize: 56, marginBottom: 12 }}>🤖</div>
              <h3>暂无智能体</h3>
              <p>点击右上角「创建智能体」开始构建</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {agents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    categories={categories}
                    selected={selectedIds.has(agent.id)}
                    onToggleSelect={() => toggleSelect(agent.id)}
                    onConfig={() => navigate(`/admin/agents/${agent.id}/config`)}
                    onWorkflow={() => navigate(`/admin/workflow/${agent.id}`)}
                    onDetail={() => navigate(`/admin/agents/${agent.id}/detail`)}
                    onMetrics={() => navigate(`/admin/agents/${agent.id}/metrics`)}
                    onPublish={() => handlePublish(agent)}
                    onCopy={() => handleCopy(agent)}
                    onDelete={() => setDeleteConfirm(agent)}
                  />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Agent Modal */}
      {showCreate && (
        <Modal
          title="创建智能体"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}>创建</button>
            </>
          }
        >
          {/* Avatar select */}
          <div className="form-group">
            <label className="form-label">选择头像</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {AVATARS.map(av => (
                <button
                  key={av}
                  onClick={() => setForm(p => ({ ...p, avatar: av }))}
                  style={{
                    width: 40, height: 40,
                    borderRadius: 10, fontSize: 22,
                    border: form.avatar === av ? '2px solid #2A83FF' : '2px solid #e2e8f0',
                    background: form.avatar === av ? '#E8F2FF' : 'white',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">智能体名称 <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="请输入名称" maxLength={50} />
          </div>
          
          <div className="form-group">
            <label className="form-label">简介描述</label>
            <textarea className="form-textarea" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="请输入简介" maxLength={200} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">智能体类型 <span style={{ color: '#ef4444' }}>*</span></label>
              <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="chat">对话型</option>
                <option value="generate">生成型</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">构建方式 <span style={{ color: '#ef4444' }}>*</span></label>
              <select className="form-select" value={form.buildMode} onChange={e => setForm(p => ({ ...p, buildMode: e.target.value }))}>
                <option value="simple">简易模式</option>
                <option value="workflow">🔀 编排模式</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">所属分类 <span style={{ color: '#ef4444' }}>*</span></label>
            <select className="form-select" value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
              <option value="">请选择分类</option>
              {getAllLeafCats().map(cat => (
                <option key={cat.id} value={cat.id}>
                  {categories.find(c => c.id === cat.parentId)?.name ? 
                    `${categories.find(c => c.id === cat.parentId).name} / ${cat.name}` : 
                    cat.name}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* Create Category Modal */}
      {showCatCreate && (
        <Modal
          title={editCat ? '编辑分类' : '新建分类'}
          onClose={() => { setShowCatCreate(false); setEditCat(null); setCatForm({ name: '', parentId: '' }); }}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => { setShowCatCreate(false); setEditCat(null); }}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateCategory}>{editCat ? '保存' : '创建'}</button>
            </>
          }
          width="400px"
        >
          <div className="form-group">
            <label className="form-label">分类名称 *</label>
            <input className="form-input" value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="请输入分类名称" />
          </div>
          {!editCat && (
            <div className="form-group">
              <label className="form-label">所属上级分类</label>
              <select className="form-select" value={catForm.parentId} onChange={e => setCatForm(p => ({ ...p, parentId: e.target.value }))}>
                <option value="">根目录（一级分类）</option>
                {topCats.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>最多支持2级分类</div>
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <ConfirmModal
          title="删除智能体"
          message={`确定要删除智能体「${deleteConfirm.name}」吗？此操作不可恢复。`}
          onConfirm={handleDeleteAgent}
          onCancel={() => setDeleteConfirm(null)}
          danger
        />
      )}

      {/* Batch confirm */}
      {batchConfirm && (
        <ConfirmModal
          title="批量操作确认"
          message={batchConfirm.msg}
          onConfirm={executeBatch}
          onCancel={() => setBatchConfirm(null)}
          danger={batchConfirm.action === 'delete'}
        />
      )}

      {/* Move modal */}
      {showMoveModal && (
        <Modal
          title="移动智能体到分类"
          onClose={() => { setShowMoveModal(false); setMoveTargetCat(''); }}
          width="400px"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => { setShowMoveModal(false); setMoveTargetCat(''); }}>取消</button>
              <button className="btn btn-primary" onClick={handleBatchMove}>移动</button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            将选中的 {selectedIds.size} 个智能体移动到：
          </p>
          <div className="form-group">
            <select className="form-select" value={moveTargetCat} onChange={e => setMoveTargetCat(e.target.value)}>
              <option value="">请选择目标分类</option>
              {getAllLeafCats().map(cat => (
                <option key={cat.id} value={cat.id}>
                  {categories.find(c => c.id === cat.parentId)?.name ? 
                    `${categories.find(c => c.id === cat.parentId).name} / ${cat.name}` : 
                    cat.name}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CategoryItem({ icon, label, active, onClick, onEdit, indent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={onClick}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 7,
          padding: `7px ${indent ? '10px 7px 24px' : '10px'}`,
          borderRadius: 7, border: 'none', cursor: 'pointer',
          background: active ? '#E8F2FF' : 'transparent',
          color: active ? '#1F6AE0' : '#64748b',
          fontSize: indent ? 12 : 13,
          fontWeight: active ? 600 : 400,
          textAlign: 'left', transition: 'all 0.15s'
        }}
      >
        <span>{icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {onEdit && (
        <button onClick={onEdit} style={{ padding: '4px 6px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8', borderRadius: 4 }}>✎</button>
      )}
    </div>
  );
}

function AgentCard({ agent, categories, selected, onToggleSelect, onConfig, onDetail, onMetrics, onPublish, onCopy, onDelete, onWorkflow }) {
  const cat = categories.find(c => c.id === agent.categoryId);
  const parentCat = cat?.parentId ? categories.find(c => c.id === cat.parentId) : null;
  
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      {/* Selection checkbox */}
      <input
        type="checkbox"
        checked={selected || false}
        onChange={onToggleSelect}
        style={{ position: 'absolute', top: 12, right: 12, width: 18, height: 18, cursor: 'pointer' }}
        onClick={e => e.stopPropagation()}
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, #E8F2FF, #BBD4FF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
        }}>
          {agent.avatar}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{agent.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className={`tag ${agent.type === 'chat' ? 'tag-primary' : 'tag-success'}`} style={{ fontSize: 11 }}>
              {agent.type === 'chat' ? '对话型' : '生成型'}
            </span>
            <span className={`tag ${agent.status === 'published' ? 'tag-success' : 'tag-gray'}`} style={{ fontSize: 11 }}>
              {agent.status === 'published' ? '● 已发布' : '○ 草稿'}
            </span>
            {agent.buildMode === 'workflow' && (
              <span className="tag" style={{ fontSize: 11, background: '#E8F2FF', color: '#1F6AE0' }}>🔀 编排</span>
            )}
          </div>
        </div>
      </div>
      
      {agent.description && (
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {agent.description}
        </p>
      )}
      
      {cat && (
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          📁 {parentCat ? `${parentCat.name} / ` : ''}{cat.name}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={onConfig} style={{ flex: 1 }}>
          ⚙️ 配置
        </button>
        {agent.buildMode === 'workflow' && (
          <button className="btn btn-outline btn-sm" onClick={onWorkflow} style={{ background: '#EFF5FF', borderColor: '#BFD7FF', color: '#1F6AE0' }}>
            🔀 编排
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={onDetail} title="查看详情">🔍</button>
        <button className="btn btn-outline btn-sm" onClick={onMetrics} title="使用监测">📊</button>
        <button
          className={`btn btn-sm ${agent.status === 'published' ? 'btn-outline' : 'btn-outline'}`}
          onClick={onPublish}
          style={{ 
            flex: 1, 
            color: agent.status === 'published' ? '#f59e0b' : '#10b981',
            borderColor: agent.status === 'published' ? '#fcd34d' : '#6ee7b7'
          }}
        >
          {agent.status === 'published' ? '⬇ 下线' : '⬆ 发布'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={onCopy} title="复制">📋</button>
        <button className="btn btn-danger btn-sm" onClick={onDelete} title="删除">🗑</button>
      </div>
    </div>
  );
}
