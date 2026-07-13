import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { knowledgeAPI, uploadAPI } from '../../api';
import { Modal, ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';

export default function AdminKnowledgeDetail() {
  const { kbId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [kb, setKb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('documents');
  const [deleteDocConfirm, setDeleteDocConfirm] = useState(null);
  const [hitTestQuery, setHitTestQuery] = useState('');
  const [hitTestResults, setHitTestResults] = useState([]);
  const [hitTestLoading, setHitTestLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Document form
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docForm, setDocForm] = useState({ name: '', content: '', type: 'text' });
  const [uploading, setUploading] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);

  // FAQ form
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', tags: '', relatedKnowledge: '' });
  const [editingFaq, setEditingFaq] = useState(null);
  const [addingFaq, setAddingFaq] = useState(false);

  // Structured config
  const [structConfig, setStructConfig] = useState({ indexFields: [], delimiter: ',' });
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvName, setCsvName] = useState('');
  const [csvPreview, setCsvPreview] = useState(null);

  // Graph form
  const [entityForm, setEntityForm] = useState({ name: '', type: '', description: '', properties: '' });
  const [relationForm, setRelationForm] = useState({ sourceId: '', targetId: '', type: '', description: '' });
  const [graphData, setGraphData] = useState({ entities: [], relations: [] });
  const [graphLoading, setGraphLoading] = useState(false);

  const kbType = kb?.type || 'document';

  useEffect(() => { loadData(); }, [kbId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await knowledgeAPI.get(kbId);
      setKb(res.data);
      if (res.data.config) setStructConfig(res.data.config);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const loadGraph = async () => {
    setGraphLoading(true);
    try {
      const res = await knowledgeAPI.getGraph(kbId);
      setGraphData(res.data);
    } catch (e) { toast.error(e.message); }
    finally { setGraphLoading(false); }
  };

  // ===== Document Management =====
  const handleFileUpload = async (file) => {
    setUploading(true);
    try {
      const res = await uploadAPI.document(file);
      const { fileName, content } = res.data;
      setDocForm({ name: fileName, content: content || '', type: 'text' });
    } catch (e) { toast.error('文件上传失败: ' + e.message); }
    finally { setUploading(false); }
  };

  const handleAddDocument = async () => {
    if (!docForm.name.trim()) return toast.error('请填写文档名称');
    if (!docForm.content.trim()) return toast.error('请填写文档内容');
    setAddingDoc(true);
    try {
      await knowledgeAPI.addDocument(kbId, docForm);
      toast.success('文档添加成功');
      setShowAddDoc(false);
      setDocForm({ name: '', content: '', type: 'text' });
      loadData();
    } catch (e) { toast.error(e.message); }
    finally { setAddingDoc(false); }
  };

  const handleDeleteDoc = async () => {
    try {
      await knowledgeAPI.deleteDocument(kbId, deleteDocConfirm.id);
      toast.success('文档已删除');
      setDeleteDocConfirm(null);
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  // ===== FAQ Management =====
  const getFaqDoc = () => kb?.documents?.find(d => d.type === 'faq') || null;

  const handleAddFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return toast.error('请填写问题和答案');
    const faqDoc = getFaqDoc();
    if (!faqDoc) return toast.error('请先添加FAQ文档');
    setAddingFaq(true);
    try {
      await knowledgeAPI.addFaqs(kbId, faqDoc.id, [{
        question: faqForm.question,
        answer: faqForm.answer,
        tags: faqForm.tags ? faqForm.tags.split(',').map(t => t.trim()) : [],
        relatedKnowledge: faqForm.relatedKnowledge ? faqForm.relatedKnowledge.split(',').map(t => t.trim()) : []
      }]);
      toast.success('FAQ已添加');
      setFaqForm({ question: '', answer: '', tags: '', relatedKnowledge: '' });
      loadData();
    } catch (e) { toast.error(e.message); }
    finally { setAddingFaq(false); }
  };

  const handleUpdateFaq = async () => {
    const faqDoc = getFaqDoc();
    if (!faqDoc || !editingFaq) return;
    try {
      await knowledgeAPI.updateFaq(kbId, faqDoc.id, editingFaq.id, {
        question: editingFaq.question,
        answer: editingFaq.answer,
        tags: editingFaq.tags || [],
        relatedKnowledge: editingFaq.relatedKnowledge || []
      });
      toast.success('FAQ已更新');
      setEditingFaq(null);
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handleDeleteFaq = async (faqId) => {
    const faqDoc = getFaqDoc();
    if (!faqDoc) return;
    try {
      await knowledgeAPI.deleteFaq(kbId, faqDoc.id, faqId);
      toast.success('FAQ已删除');
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  // ===== Structured Data =====
  const handleUpdateStructConfig = async () => {
    try {
      await knowledgeAPI.updateConfig(kbId, structConfig);
      toast.success('配置已保存');
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const handleImportCsv = async () => {
    if (!csvContent.trim() || !csvName.trim()) return toast.error('请填写名称和内容');
    try {
      await knowledgeAPI.importDocument(kbId, {
        name: csvName,
        content: csvContent,
        type: 'structured'
      });
      toast.success('结构化数据已导入');
      setShowImportCsv(false);
      setCsvContent('');
      setCsvName('');
      setCsvPreview(null);
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  const previewCsv = (content) => {
    const rows = content.split('\n').filter(l => l.trim()).slice(0, 10);
    const data = rows.map(r => {
      const cols = []; let col = '', inQ = false;
      for (let i = 0; i < r.length; i++) {
        if (r[i] === '"') { if (inQ && r[i+1] === '"') { col += '"'; i++; } else inQ = !inQ; }
        else if ((r[i] === ',' || r[i] === '\t') && !inQ) { cols.push(col.trim()); col = ''; }
        else col += r[i];
      }
      cols.push(col.trim());
      return cols;
    });
    setCsvPreview(data);
  };

  // ===== Graph Management =====
  const handleAddEntity = async () => {
    if (!entityForm.name.trim() || !entityForm.type.trim()) return toast.error('请填写实体名称和类型');
    let properties = {};
    if (entityForm.properties.trim()) {
      try { properties = JSON.parse(entityForm.properties); }
      catch { return toast.error('属性格式错误，请使用JSON格式'); }
    }
    try {
      await knowledgeAPI.addEntities(kbId, [{ ...entityForm, properties }]);
      toast.success('实体已添加');
      setEntityForm({ name: '', type: '', description: '', properties: '' });
      loadGraph();
    } catch (e) { toast.error(e.message); }
  };

  const handleDeleteEntity = async (entityId) => {
    try {
      await knowledgeAPI.deleteEntity(kbId, entityId);
      toast.success('实体已删除');
      loadGraph();
    } catch (e) { toast.error(e.message); }
  };

  const handleAddRelation = async () => {
    if (!relationForm.sourceId || !relationForm.targetId) return toast.error('请选择源实体和目标实体');
    try {
      await knowledgeAPI.addRelations(kbId, [relationForm]);
      toast.success('关系已添加');
      setRelationForm({ sourceId: '', targetId: '', type: '', description: '' });
      loadGraph();
    } catch (e) { toast.error(e.message); }
  };

  const handleDeleteRelation = async (relId) => {
    try {
      await knowledgeAPI.deleteRelation(kbId, relId);
      toast.success('关系已删除');
      loadGraph();
    } catch (e) { toast.error(e.message); }
  };

  // ===== Hit Test =====
  const handleHitTest = async () => {
    if (!hitTestQuery.trim()) return;
    setHitTestLoading(true);
    try {
      const res = await knowledgeAPI.hitTest(kbId, hitTestQuery);
      setHitTestResults(res.data.results || []);
    } catch (e) { toast.error(e.message); }
    finally { setHitTestLoading(false); }
  };

  // ===== Publish =====
  const handlePublish = async () => {
    try {
      if (kb.status === 'published') {
        await knowledgeAPI.unpublish(kbId);
        toast.success('知识库已下线');
      } else {
        await knowledgeAPI.publish(kbId);
        toast.success('知识库已发布');
      }
      loadData();
    } catch (e) { toast.error(e.message); }
  };

  // ===== Auto-focus tabs =====
  useEffect(() => {
    if (kb) {
      if (kbType === 'faq') setActiveTab('faq');
      else if (kbType === 'structured') setActiveTab('structured');
      else if (kbType === 'graph') { setActiveTab('graph'); loadGraph(); }
      else setActiveTab('documents');
    }
  }, [kbType, kb?.id]);

  if (loading || !kb) {
    return <div className="loading">加载中...</div>;
  }

  const getTabs = () => {
    const tabs = [];
    if (kbType === 'document') tabs.push({ id: 'documents', label: '📄 文档列表' });
    if (kbType === 'faq') tabs.push({ id: 'faq', label: '❓ FAQ管理' });
    if (kbType === 'structured') tabs.push({ id: 'structured', label: '📊 结构化数据' });
    if (kbType === 'graph') tabs.push({ id: 'graph', label: '🔗 图谱管理' });
    tabs.push({ id: 'hitTest', label: '🎯 命中测试' });
    return tabs;
  };

  const typeLabels = {
    document: '文本文档', faq: 'FAQ知识库', structured: '结构化文本', graph: '图知识库'
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <button onClick={() => navigate('/admin/knowledge')} className="btn-back">← 返回</button>
        <div style={{ flex: 1 }}>
          <h2>{kb.name}</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span className={`status-badge ${kb.status === 'published' ? 'published' : 'draft'}`}>
              {kb.status === 'published' ? '● 已发布' : '○ 草稿'}
            </span>
            <span className="tag">{typeLabels[kbType]}</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{kb.documents?.length || 0} 个文档</span>
          </div>
        </div>
        <button
          className={`btn ${kb.status === 'published' ? 'btn-outline' : 'btn-primary'}`}
          onClick={handlePublish}
        >
          {kb.status === 'published' ? '⬇ 下线' : '⬆ 发布'}
        </button>
        {kbType === 'document' || kbType === 'faq' ? (
          <button className="btn btn-primary" onClick={() => setShowAddDoc(true)}>
            + 添加文档
          </button>
        ) : kbType === 'structured' ? (
          <button className="btn btn-primary" onClick={() => setShowImportCsv(true)}>
            + 导入数据
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="kb-tabs">
        {getTabs().map(tab => (
          <button key={tab.id}
            className={`kb-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id); if (tab.id === 'graph') loadGraph(); }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ==================== Documents Tab ==================== */}
      {activeTab === 'documents' && (
        <div>
          {(!kb.documents || kb.documents.length === 0) ? (
            <div className="empty-state card">
              <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
              <h3>暂无文档</h3>
              <p>点击「添加文档」上传或粘贴文档内容</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {kb.documents.map(doc => (
                <div key={doc.id} className="card kb-doc" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="kb-avatar-sm">{doc.type === 'faq' ? '❓' : '📄'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, marginBottom: 3 }}>{doc.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {doc.type === 'faq' ? `${doc.metadata?.faqs?.length || 0} 个问答对` : `${doc.segments?.length || 0} 个段落`}
                      <span className="tag" style={{ fontSize: 10, marginLeft: 8, background: '#d1fae5', color: '#059669' }}>
                        ✓ {doc.status === 'parsed' ? '已解析' : doc.status}
                      </span>
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteDocConfirm(doc)}>删除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== FAQ Tab ==================== */}
      {activeTab === 'faq' && (
        <div>
          {/* Add FAQ Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>添加问答对</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="form-label">问题 *</label>
                <input className="form-input" value={faqForm.question}
                  onChange={e => setFaqForm(p => ({ ...p, question: e.target.value }))}
                  placeholder="输入问题" />
              </div>
              <div>
                <label className="form-label">答案 *</label>
                <input className="form-input" value={faqForm.answer}
                  onChange={e => setFaqForm(p => ({ ...p, answer: e.target.value }))}
                  placeholder="输入答案" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="form-label">标签（逗号分隔）</label>
                <input className="form-input" value={faqForm.tags}
                  onChange={e => setFaqForm(p => ({ ...p, tags: e.target.value }))}
                  placeholder="例如：业务,财务" />
              </div>
              <div>
                <label className="form-label">知识关联（逗号分隔）</label>
                <input className="form-input" value={faqForm.relatedKnowledge}
                  onChange={e => setFaqForm(p => ({ ...p, relatedKnowledge: e.target.value }))}
                  placeholder="关联的知识库名称" />
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleAddFaq} disabled={addingFaq}>
              {addingFaq ? '添加中...' : '➕ 添加FAQ'}
            </button>
          </div>

          {/* FAQ List */}
          {(() => {
            const faqDoc = getFaqDoc();
            const faqs = faqDoc?.metadata?.faqs || [];
            if (faqs.length === 0) {
              return (
                <div className="empty-section">
                  <p style={{ color: '#94a3b8' }}>
                    {faqDoc ? '暂无FAQ问答对，请使用上方表单添加' : '请先在文档列表中添加FAQ文档'}
                  </p>
                </div>
              );
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>共 {faqs.length} 个问答对</div>
                {faqs.map((faq, i) => (
                  <div key={faq.id} className="card">
                    {editingFaq?.id === faq.id ? (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <label className="form-label">问题</label>
                            <input className="form-input" value={editingFaq.question}
                              onChange={e => setEditingFaq(p => ({ ...p, question: e.target.value }))} />
                          </div>
                          <div>
                            <label className="form-label">答案</label>
                            <input className="form-input" value={editingFaq.answer}
                              onChange={e => setEditingFaq(p => ({ ...p, answer: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={handleUpdateFaq}>保存</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingFaq(null)}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#2A83FF', marginBottom: 6 }}>
                              Q{faqs.length > 1 ? `${i+1}` : ''}: {faq.question}
                            </div>
                            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 8 }}>
                              {faq.answer}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {(faq.tags || []).map((t, j) => (
                                <span key={j} className="tag" style={{ fontSize: 11 }}>{t}</span>
                              ))}
                              {(faq.relatedKnowledge || []).map((rk, j) => (
                                <span key={j} className="tag" style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8' }}>📚 {rk}</span>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button className="btn btn-outline btn-sm" onClick={() => setEditingFaq({ ...faq })} title="编辑">✎</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteFaq(faq.id)} title="删除">×</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ==================== Structured Data Tab ==================== */}
      {activeTab === 'structured' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
          {/* Left: Config Panel */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>索引配置</h3>
              <div className="form-group">
                <label className="form-label">索引字段（JSON数组）</label>
                <input className="form-input"
                  value={(structConfig.indexFields || []).join(', ')}
                  onChange={e => setStructConfig(p => ({
                    ...p, indexFields: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  }))}
                  placeholder="字段名, 字段名..." />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  指定哪些列作为检索索引字段
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">分隔符</label>
                <select className="form-input" value={structConfig.delimiter || ','}
                  onChange={e => setStructConfig(p => ({ ...p, delimiter: e.target.value }))}>
                  <option value=",">逗号 (,)</option>
                  <option value="\t">制表符 (Tab)</option>
                  <option value=";">分号 (;)</option>
                </select>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleUpdateStructConfig} style={{ width: '100%' }}>
                保存配置
              </button>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>操作</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowImportCsv(true)} style={{ width: '100%', marginBottom: 8 }}>
                + 导入CSV数据
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin/knowledge/${kbId}`)} style={{ width: '100%' }}>
                查看文档列表
              </button>
            </div>
          </div>

          {/* Right: Data View */}
          <div>
            {kb.documents?.filter(d => d.type === 'structured').length === 0 ? (
              <div className="empty-state card">
                <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                <h3>暂无结构化数据</h3>
                <p>点击「导入CSV数据」开始添加</p>
              </div>
            ) : (
              kb.documents.filter(d => d.type === 'structured').map(doc => (
                <div key={doc.id} className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{doc.name}</strong>
                      <span className="tag" style={{ marginLeft: 8, fontSize: 11 }}>
                        {doc.metadata?.rowCount || 0} 行数据 · {doc.segments?.length || 0} 个段落
                      </span>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteDocConfirm(doc)}>删除</button>
                  </div>
                  {doc.metadata?.headers && doc.metadata.headers.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                            {doc.metadata.headers.map((h, i) => (
                              <th key={i} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {h}
                                {(structConfig.indexFields || []).includes(h) && <span style={{ color: '#2A83FF', marginLeft: 4 }}>★</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {doc.segments.slice(0, 20).map((seg, i) => {
                            const cells = seg.content.split(' | ');
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{i + 1}</td>
                                {cells.map((c, j) => (
                                  <td key={j} style={{ padding: '6px 10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {doc.segments.length > 20 && (
                        <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                          显示前 20 行，共 {doc.segments.length} 行
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================== Graph Tab ==================== */}
      {activeTab === 'graph' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Entities Column */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>实体管理</h3>
              <div className="form-group">
                <label className="form-label">实体名称 *</label>
                <input className="form-input" value={entityForm.name}
                  onChange={e => setEntityForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="例如：北京分公司" />
              </div>
              <div className="form-group">
                <label className="form-label">实体类型 *</label>
                <input className="form-input" value={entityForm.type}
                  onChange={e => setEntityForm(p => ({ ...p, type: e.target.value }))}
                  placeholder="例如：组织、产品、人员" />
              </div>
              <div className="form-group">
                <label className="form-label">描述</label>
                <input className="form-input" value={entityForm.description}
                  onChange={e => setEntityForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="可选描述" />
              </div>
              <div className="form-group">
                <label className="form-label">属性（JSON格式）</label>
                <input className="form-input" value={entityForm.properties}
                  onChange={e => setEntityForm(p => ({ ...p, properties: e.target.value }))}
                  placeholder='{"key": "value"}' />
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleAddEntity} style={{ width: '100%' }}>
                ➕ 添加实体
              </button>
            </div>

            {graphLoading ? <div className="loading">加载图谱数据...</div> : (
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  共 {graphData.entities?.length || 0} 个实体
                </div>
                {(graphData.entities || []).map(ent => (
                  <div key={ent.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: '#E8F2FF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 600, color: '#2A83FF', flexShrink: 0
                    }}>
                      {(ent.name || '?')[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{ent.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {ent.type}
                        {ent.description ? ` · ${ent.description}` : ''}
                      </div>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteEntity(ent.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Relations Column */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>关系管理</h3>
              <div className="form-group">
                <label className="form-label">源实体</label>
                <select className="form-input" value={relationForm.sourceId}
                  onChange={e => setRelationForm(p => ({ ...p, sourceId: e.target.value }))}>
                  <option value="">选择源实体</option>
                  {(graphData.entities || []).map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">目标实体</label>
                <select className="form-input" value={relationForm.targetId}
                  onChange={e => setRelationForm(p => ({ ...p, targetId: e.target.value }))}>
                  <option value="">选择目标实体</option>
                  {(graphData.entities || []).map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">关系类型 *</label>
                <input className="form-input" value={relationForm.type}
                  onChange={e => setRelationForm(p => ({ ...p, type: e.target.value }))}
                  placeholder="例如：隶属于、包含、关联" />
              </div>
              <div className="form-group">
                <label className="form-label">描述</label>
                <input className="form-input" value={relationForm.description}
                  onChange={e => setRelationForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="可选描述" />
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleAddRelation} style={{ width: '100%' }}>
                ➕ 添加关系
              </button>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                共 {graphData.relations?.length || 0} 条关系
              </div>
              {/* Simple graph visualization */}
              {(graphData.relations || []).length > 0 && (
                <div className="card" style={{ marginBottom: 16, padding: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>关系图谱</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
                    {(graphData.relations || []).slice(0, 20).map((rel, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: '#2A83FF' }}>{rel.sourceName}</span>
                        <span style={{ color: '#94a3b8' }}>—{rel.type}→</span>
                        <span style={{ fontWeight: 600, color: '#10b981' }}>{rel.targetName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(graphData.relations || []).map(rel => (
                <div key={rel.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🔗</span>
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{rel.sourceName}</span>
                    <span style={{ color: '#2A83FF', margin: '0 6px' }}>—{rel.type}→</span>
                    <span style={{ fontWeight: 500 }}>{rel.targetName}</span>
                    {rel.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{rel.description}</div>}
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRelation(rel.id)}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== Hit Test Tab ==================== */}
      {activeTab === 'hitTest' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>🎯 命中测试</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                className="form-input"
                value={hitTestQuery}
                onChange={e => setHitTestQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHitTest()}
                placeholder="输入测试问题，查看知识库召回效果..."
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleHitTest} disabled={hitTestLoading || !hitTestQuery.trim()}>
                {hitTestLoading ? <span className="spinner spinner-sm" /> : '测试'}
              </button>
            </div>
          </div>
          
          {hitTestResults.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                找到 {hitTestResults.length} 条相关结果：
              </div>
              {hitTestResults.map((r, i) => (
                <div key={i} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>📄 {r.docName} · {r.type}</span>
                    <span style={{
                      background: parseFloat(r.score) > 0.7 ? '#d1fae5' : '#fef3c7',
                      color: parseFloat(r.score) > 0.7 ? '#059669' : '#d97706',
                      borderRadius: 20, padding: '2px 8px', fontSize: 12, fontWeight: 600
                    }}>
                      相似度 {Math.round(parseFloat(r.score) * 100)}%
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{r.content}</p>
                </div>
              ))}
            </div>
          )}
          
          {hitTestResults.length === 0 && hitTestQuery && !hitTestLoading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              未找到匹配的知识片段
            </div>
          )}
        </div>
      )}

      {/* ==================== Modals ==================== */}
      {/* Add Document Modal */}
      {showAddDoc && (
        <Modal title="添加文档" onClose={() => { setShowAddDoc(false); setDocForm({ name: '', content: '', type: 'text' }); }}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setShowAddDoc(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleAddDocument} disabled={addingDoc}>
                {addingDoc ? <span className="spinner spinner-sm" /> : null} 添加
              </button>
            </>
          }
          width="640px"
        >
          <div className="form-group">
            <label className="form-label">文档名称 *</label>
            <input className="form-input" value={docForm.name} onChange={e => setDocForm(p => ({ ...p, name: e.target.value }))} placeholder="请输入文档名称" />
          </div>
          
          <div className="form-group">
            <label className="form-label">
              上传文件
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>支持 .txt .md .csv .json .pdf .docx .xlsx .xls</span>
            </label>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])}
            />
            <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <><span className="spinner spinner-sm" /> 处理中...</> : '📎 选择文件'}
            </button>
          </div>
          
          <div className="form-group">
            <label className="form-label">文档内容 *</label>
            <textarea className="form-textarea" rows={10} value={docForm.content}
              onChange={e => setDocForm(p => ({ ...p, content: e.target.value }))}
              placeholder="粘贴或输入文档内容..."
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{docForm.content.length} 字符</div>
          </div>
        </Modal>
      )}

      {/* Import CSV Modal */}
      {showImportCsv && (
        <Modal title="导入结构化数据" onClose={() => { setShowImportCsv(false); setCsvContent(''); setCsvName(''); setCsvPreview(null); }}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setShowImportCsv(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleImportCsv}>导入</button>
            </>
          }
          width="700px"
        >
          <div className="form-group">
            <label className="form-label">数据集名称 *</label>
            <input className="form-input" value={csvName}
              onChange={e => setCsvName(e.target.value)}
              placeholder="例如：客户数据、产品清单" />
          </div>
          <div className="form-group">
            <label className="form-label">
              CSV内容 *
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>第一行为表头</span>
            </label>
            <textarea className="form-textarea" rows={12} value={csvContent}
              onChange={e => { setCsvContent(e.target.value); previewCsv(e.target.value); }}
              placeholder="粘贴CSV内容，例如：&#10;名称,类型,描述&#10;北京分公司,组织,华北区域&#10;上海分公司,组织,华东区域"
              style={{ fontFamily: 'monospace', fontSize: 13 }} />
          </div>
          {csvPreview && csvPreview.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>预览（前 {csvPreview.length} 行）：</div>
              <div style={{ overflowX: 'auto', maxHeight: 200, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px', background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>#</th>
                      {csvPreview[0].map((h, i) => (
                        <th key={i} style={{ padding: '6px 10px', background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(1).map((row, i) => (
                      <tr key={i}>
                        <td style={{ padding: '4px 10px', borderBottom: '1px solid #f1f5f9', color: '#94a3b8' }}>{i + 1}</td>
                        {row.map((c, j) => (
                          <td key={j} style={{ padding: '4px 10px', borderBottom: '1px solid #f1f5f9', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Delete Document Confirm */}
      {deleteDocConfirm && (
        <ConfirmModal
          title="删除文档"
          message={`确定要删除文档「${deleteDocConfirm.name}」吗？`}
          onConfirm={handleDeleteDoc}
          onCancel={() => setDeleteDocConfirm(null)}
          danger
        />
      )}
    </div>
  );
}
