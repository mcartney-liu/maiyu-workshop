import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactFlow, {
  MiniMap, Controls, Background,
  addEdge, useNodesState, useEdgesState,
  Handle, Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useToast } from '../../components/Toast';
import { workflowAPI, agentAPI, pluginAPI, modelAPI, knowledgeAPI } from '../../api';

const NODE_CATEGORIES = [
  { label: '基础', nodes: [
    { type: 'start', label: '开始', icon: '🚀', color: '#10b981' },
    { type: 'end', label: '结束', icon: '🏁', color: '#ef4444' },
    { type: 'reply', label: '回复', icon: '💬', color: '#2A83FF' }
  ]},
  { label: 'AI能力', nodes: [
    { type: 'llm', label: 'LLM', icon: '🧠', color: '#2A83FF' },
    { type: 'knowledge', label: '知识库检索', icon: '📚', color: '#3b82f6' },
    { type: 'classifier', label: '问题分类', icon: '🔍', color: '#0EA5E9' }
  ]},
  { label: '逻辑控制', nodes: [
    { type: 'condition', label: '条件判断', icon: '🔀', color: '#0EA5E9' },
    { type: 'merge', label: '结果合并', icon: '🔗', color: '#06b6d4' },
    { type: 'loop', label: '循环', icon: '🔄', color: '#f59e0b' }
  ]},
  { label: '数据处理', nodes: [
    { type: 'http', label: 'HTTP请求', icon: '🌐', color: '#f59e0b' },
    { type: 'code', label: '代码执行', icon: '💻', color: '#ec4899' },
    { type: 'docParser', label: '文档解析', icon: '📃', color: '#14b8a6' }
  ]},
  { label: '应用集成', nodes: [
    { type: 'agent', label: 'Agent节点', icon: '🤖', color: '#a855f7' },
    { type: 'plugin', label: '插件节点', icon: '🔌', color: '#10b981' },
    { type: 'lightApp', label: '轻应用插件', icon: '📱', color: '#3b82f6' },
    { type: 'notify', label: '企业通知', icon: '📣', color: '#f97316' }
  ]},
  { label: '问答场景', nodes: [
    { type: 'lightAppQA', label: '轻应用问答', icon: '💡', color: '#0ea5e9' },
    { type: 'metricsQA', label: '指标问答', icon: '📊', color: '#84cc16' },
    { type: 'dataQA', label: '数据问答', icon: '📋', color: '#f43f5e' },
    { type: 'sqlQuery', label: 'SQL查询', icon: '🗄️', color: '#0891b2' }
  ]}
];

const nodeTypes = {
  start: StartNode, end: EndNode, reply: ReplyNode, llm: LLMNode,
  http: HTTPNode, condition: ConditionNode, knowledge: KnowledgeNode,
  classifier: ClassifierNode, merge: MergeNode, code: CodeNode,
  loop: LoopNode, docParser: DocParserNode, agent: AgentNode,
  plugin: PluginNode, lightApp: LightAppNode, notify: NotifyNode,
  lightAppQA: LightAppQANode, metricsQA: MetricsQANode, dataQA: DataQANode,
  sqlQuery: SqlQueryNode
};

const getDefaultData = (type) => {
  switch (type) {
    case 'start': return { label: '开始' };
    case 'end': return { label: '结束', resultVar: '' };
    case 'reply': return { label: '回复', content: '', format: 'text' };
    case 'llm': return { label: 'LLM', model: '', prompt: '', temperature: 0.7 };
    case 'http': return { label: 'HTTP请求', method: 'GET', url: '', body: '' };
    case 'condition': return { label: '条件判断', condition: '', trueLabel: '是', falseLabel: '否' };
    case 'knowledge': return { label: '知识库检索', kbId: '', topK: 3, threshold: 0.7, outputVar: 'knowledge' };
    case 'classifier': return { label: '问题分类', categories: [], defaultCategory: '' };
    case 'merge': return { label: '结果合并', strategy: 'first' };
    case 'code': return { label: '代码执行', language: 'python', code: '', timeout: 30 };
    case 'loop': return { label: '循环', condition: '', maxIterations: 10, iteratorVar: 'item' };
    case 'docParser': return { label: '文档解析', fileUrl: '', format: 'auto' };
    case 'agent': return { label: 'Agent', agentId: '', inputMapping: '' };
    case 'plugin': return { label: '插件', pluginId: '', inputMapping: '' };
    case 'lightApp': return { label: '轻应用插件', appId: '', inputMapping: '' };
    case 'notify': return { label: '企业通知', channel: 'dingtalk', webhook: '', message: '', atAll: false };
    case 'lightAppQA': return { label: '轻应用问答', appId: '', question: '' };
    case 'metricsQA': return { label: '指标问答', metric: '', timeRange: '' };
    case 'dataQA': return { label: '数据问答', query: '', dataSource: '' };
    case 'sqlQuery': return { label: 'SQL查询', dbType: 'mysql', host: 'localhost', port: 3306, user: 'root', password: '', database: '', sql: '', timeout: 30 };
    default: return { label: type };
  }
};

const getNodeLabel = (type) => {
  const map = {
    start: '开始', end: '结束', reply: '回复', llm: 'LLM', http: 'HTTP请求',
    condition: '条件判断', knowledge: '知识库检索', classifier: '问题分类',
    merge: '结果合并', code: '代码执行', loop: '循环', docParser: '文档解析',
    agent: 'Agent节点', plugin: '插件节点', lightApp: '轻应用插件',
    notify: '企业通知', lightAppQA: '轻应用问答', metricsQA: '指标问答', dataQA: '数据问答',
    sqlQuery: 'SQL查询'
  };
  return map[type] || type;
};

// ======================== 节点说明（易用性） ========================
const NODE_INFO = {
  start: { desc: '工作流入口，接收用户输入', beginner: true, howto: '无需配置，用户提问从这里进入。' },
  end: { desc: '标记工作流结束', howto: '一般不用，回复节点已自带结束。' },
  reply: { desc: '把结果回复给用户', beginner: true, howto: '内容写 {{_result}} 引用上一步结果，可用 Markdown 渲染。', example: '{{_result}}' },
  llm: { desc: '调用大模型生成内容', beginner: true, howto: '提示词用 {{query}} 引用用户问题、{{knowledge}} 引用知识库结果。', example: '你是一个助手，回答：{{query}}' },
  knowledge: { desc: '从知识库检索相关内容', beginner: true, howto: '选知识库，TopK 控制取几条，结果存到输出变量（默认 knowledge）。', example: 'outputVar: knowledge' },
  classifier: { desc: '按分类分流到不同分支', howto: '列出分类，工作流按命中分类走不同路线。' },
  condition: { desc: 'if 判断，走「是/否」分支', howto: '条件写 JS 表达式，如 {{result}}=="成功"。' },
  merge: { desc: '合并多个分支结果', howto: '可选取第一个 / 拼接 / 取最优。' },
  http: { desc: '调用外部 HTTP 接口', howto: '填 URL 和方法，可在代码节点拿到返回值。' },
  code: { desc: '执行 Python/JS 代码', howto: '用 result 变量读取上一步结果，return 返回。' },
  loop: { desc: '循环执行某个节点', howto: '设定循环条件和最大次数。' },
  docParser: { desc: '解析文档内容', howto: '填文档 URL 或 {{fileUrl}} 变量。' },
  agent: { desc: '调用另一个智能体', howto: '填子智能体 ID。' },
  plugin: { desc: '调用已发布插件', howto: '从下拉选插件，配置输入映射。' },
  lightApp: { desc: '调用轻应用插件', howto: '从下拉选轻应用。' },
  notify: { desc: '发送钉钉/邮件通知', howto: '填 webhook 和消息内容。' },
  lightAppQA: { desc: '轻应用问答', howto: '选轻应用，问题用 {{userQuestion}}。' },
  metricsQA: { desc: '指标问答', howto: '填指标名和时间范围。' },
  dataQA: { desc: '数据问答', howto: '填数据源和查询模板。' },
  sqlQuery: { desc: '连接数据库执行 SQL', howto: '配置数据库连接，SQL 可用 {{变量}}。需先安装驱动。', example: 'SELECT * FROM t' }
};

// 根据当前工作流节点，计算可插入的变量列表
const getVarsForFlow = (nodes) => {
  const vars = [{ name: 'query', desc: '用户的输入问题' }];
  (nodes || []).forEach(n => {
    if (n.type === 'knowledge' && n.data?.outputVar) {
      vars.push({ name: n.data.outputVar, desc: '知识库检索结果' });
    }
    if (n.type === 'end' && n.data?.resultVar) {
      vars.push({ name: n.data.resultVar, desc: '结束节点输出' });
    }
  });
  vars.push({ name: '_result', desc: '上一节点的输出结果' });
  return vars;
};

// ======================== 内置工作流模板 ========================
const WORKFLOW_TEMPLATES = [
  {
    id: 'qa', name: '问答助手', desc: '根据知识库回答用户问题',
    build: () => ({
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 80, y: 120 }, data: { label: '开始' } },
        { id: 'kb-1', type: 'knowledge', position: { x: 320, y: 120 }, data: { label: '知识库检索', kbId: '', topK: 5, threshold: 0.7, outputVar: 'knowledge' } },
        { id: 'llm-1', type: 'llm', position: { x: 560, y: 120 }, data: { label: 'LLM', model: 'zhipu/glm-4-flash-250414', temperature: 0.3, prompt: '你是一个智能助手。请根据以下知识库内容回答用户问题。\n\n【知识库内容】\n{{knowledge}}\n\n【用户问题】\n{{query}}\n\n要求：\n1. 基于知识库内容作答，不要编造\n2. 知识库不足时如实告知\n3. 用清晰有条理的方式回答' } },
        { id: 'reply-1', type: 'reply', position: { x: 800, y: 120 }, data: { label: '回复', content: '{{_result}}', format: 'markdown' } }
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'kb-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } },
        { id: 'e2', source: 'kb-1', target: 'llm-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } },
        { id: 'e3', source: 'llm-1', target: 'reply-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } }
      ]
    })
  },
  {
    id: 'nl2sql', name: 'NL2SQL 问数', desc: '自然语言转 SQL 查询数据库',
    build: () => ({
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 80, y: 120 }, data: { label: '开始' } },
        { id: 'llm-1', type: 'llm', position: { x: 320, y: 120 }, data: { label: 'LLM', model: 'zhipu/glm-4-flash-250414', temperature: 0.2, prompt: '你是一个 SQL 生成器（MySQL）。根据下面的表结构和用户问题，生成一条 SELECT 语句。\n\n【表结构】\n(在此填写你的表结构，例如)\n- customers: id, name, city, created_at\n- orders: id, customer_id, amount, order_date\n\n【规则】\n1. 只输出 SQL，不写解释，不用代码块包裹\n2. 只允许 SELECT 语句\n\n【用户问题】\n{{query}}' } },
        { id: 'sql-1', type: 'sqlQuery', position: { x: 600, y: 120 }, data: { label: 'SQL查询', dbType: 'mysql', host: 'localhost', port: 3306, user: 'root', password: '', database: '', sql: '{{_result}}', timeout: 30 } },
        { id: 'reply-1', type: 'reply', position: { x: 860, y: 120 }, data: { label: '回复', content: '查询结果：\n{{_result}}', format: 'markdown' } }
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'llm-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } },
        { id: 'e2', source: 'llm-1', target: 'sql-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } },
        { id: 'e3', source: 'sql-1', target: 'reply-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } }
      ]
    })
  },
  {
    id: 'chat', name: '对话直答', desc: '不依赖知识库，直接让大模型回答',
    build: () => ({
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 120, y: 140 }, data: { label: '开始' } },
        { id: 'llm-1', type: 'llm', position: { x: 420, y: 140 }, data: { label: 'LLM', model: 'zhipu/glm-4-flash-250414', temperature: 0.7, prompt: '你是一个 helpful 的助手，回答用户问题：\n{{query}}' } },
        { id: 'reply-1', type: 'reply', position: { x: 720, y: 140 }, data: { label: '回复', content: '{{_result}}', format: 'markdown' } }
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'llm-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } },
        { id: 'e2', source: 'llm-1', target: 'reply-1', type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } }
      ]
    })
  }
];

export default function AdminWorkflow() {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const toast = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: 'start', type: 'start', position: { x: 400, y: 20 }, data: { label: '开始' } },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wfLoaded, setWfLoaded] = useState(false);

  // Standalone mode: load all agents for selection
  const [allAgents, setAllAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  useEffect(() => {
    if (agentId) return;
    setAgentsLoading(true);
    agentAPI.list().then(res => {
      setAllAgents(res.data?.agents || []);
    }).catch(() => {}).finally(() => setAgentsLoading(false));
  }, [agentId]);

  // Load workflow from backend
  useEffect(() => {
    if (!agentId || wfLoaded) return;
    setLoading(true);
    workflowAPI.get(agentId).then(res => {
      const data = res.data;
      if (data.nodes && data.nodes.length > 0) {
        setNodes(data.nodes);
        setEdges(data.edges || []);
      }
      setWfLoaded(true);
    }).catch(() => {
      setWfLoaded(true);
    }).finally(() => setLoading(false));
  }, [agentId, wfLoaded]);

  // Save workflow to backend
  const saveWorkflow = async () => {
    if (!agentId) {
      toast.warning('请先选择智能体');
      return;
    }
    setSaving(true);
    try {
      await workflowAPI.save(agentId, { nodes, edges });
      toast.success('工作流已保存');
    } catch (err) {
      toast.error('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const onConnect = useCallback((connection) => {
    setEdges(eds => addEdge({
      ...connection,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#2A83FF', strokeWidth: 2 }
    }, eds));
  }, [setEdges]);

  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const onEdgesDelete = useCallback((edgesToDelete) => {
    setEdges(eds => eds.filter(e => !edgesToDelete.find(d => d.id === e.id)));
    setSelectedEdge(null);
  }, []);

  const onNodesDelete = useCallback((nodesToDelete) => {
    setNodes(nds => nds.filter(n => !nodesToDelete.find(d => d.id === n.id)));
    setSelectedNode(null);
  }, []);

  const addNode = (type) => {
    const id = `${type}_${Date.now()}`;
    setNodes(nds => [...nds, { id, type, position: { x: 150 + Math.random() * 500, y: 100 + Math.random() * 400 }, data: getDefaultData(type) }]);
    toast.success(`已添加${getNodeLabel(type)}节点`);
    setShowNodeMenu(false);
  };

  const onNodeClick = (_, node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };
  const onPaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const updateNodeData = (key, value) => {
    if (!selectedNode) return;
    setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, [key]: value } } : n));
    setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, [key]: value } } : null);
  };

  const deleteNode = () => {
    if (!selectedNode) return;
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    setSelectedNode(null);
  };

  const deleteEdge = () => {
    if (!selectedEdge) return;
    setEdges(eds => eds.filter(e => e.id !== selectedEdge.id));
    setSelectedEdge(null);
  };

  const loadTemplate = (id) => {
    const tpl = WORKFLOW_TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    if (nodes.length > 1 && !window.confirm('加载模板将覆盖当前工作流，确定继续？')) {
      setShowTemplateMenu(false);
      return;
    }
    const flow = tpl.build();
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelectedNode(null);
    setShowTemplateMenu(false);
    toast.success(`已加载模板：${tpl.name}`);
  };

  return (
    <div style={{ padding: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* === Standalone mode: Agent selector === */}
      {!agentId && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 18 }}>🔀 工作流编排 — 选择智能体</h2>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
            每个智能体拥有独立的工作流，选择一个智能体开始编排。
          </p>
          {agentsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>加载中...</div>
          ) : allAgents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              暂无智能体，请先 <span onClick={() => navigate('/admin/agents')} style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>创建智能体</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {allAgents.map(a => (
                <div key={a.id} className="card" style={{ padding: 20, cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/workflow/${a.id}`)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 24 }}>{a.avatar || '🤖'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {a.buildMode === 'workflow' ? '🔀 编排模式' : '简单模式'}
                        {a.workflow?.enabled && ' · 已启用'}
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                    {a.description || '暂无描述'}
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <span className="btn btn-primary btn-sm">进入编排 →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === Agent-specific mode: Canvas editor === */}
      {agentId && (<>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>🔀 工作流编排 {loading && <span style={{ fontSize: 12, color: '#94a3b8' }}>加载中...</span>}</h2>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button className="btn btn-primary btn-sm" onClick={saveWorkflow} disabled={saving}>
            {saving ? '保存中...' : '💾 保存'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowTemplateMenu(!showTemplateMenu)}>📋 模板</button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowNodeMenu(!showNodeMenu)}>+ 添加节点</button>
          {selectedEdge && (
            <button className="btn btn-outline btn-sm" style={{ color: '#ef4444' }} onClick={deleteEdge}>🗑 删除连线</button>
          )}
          {showNodeMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 100,
              background: 'white', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0', width: 280, maxHeight: 460, overflow: 'auto', marginTop: 4, padding: 8
            }}>
              {NODE_CATEGORIES.map(cat => (
                <div key={cat.label}>
                  <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px', fontWeight: 600, textTransform: 'uppercase' }}>{cat.label}</div>
                  {cat.nodes.map(n => (
                    <button key={n.type} onClick={() => addNode(n.type)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <span style={{ width: 28, height: 28, borderRadius: 6, background: n.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n.icon}</span>
                      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{n.label}</span>
                          {NODE_INFO[n.type]?.beginner && <span style={{ fontSize: 9, lineHeight: 1, background: '#E8F2FF', color: '#1F6AE0', padding: '2px 5px', borderRadius: 4 }}>推荐</span>}
                        </div>
                        {NODE_INFO[n.type]?.desc && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{NODE_INFO[n.type].desc}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          {showTemplateMenu && (
            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, background: 'white', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', width: 280, marginTop: 4, padding: 8 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px', fontWeight: 600 }}>选择模板（将覆盖当前画布）</div>
              {WORKFLOW_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => loadTemplate(t.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
        {/* Canvas */}
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}
          onClick={() => { setShowNodeMenu(false); }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick} onPaneClick={onPaneClick}
            onEdgeClick={onEdgeClick}
            onEdgesDelete={onEdgesDelete}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            connectionLineStyle={{ stroke: '#2A83FF', strokeWidth: 2 }}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true, style: { stroke: '#2A83FF', strokeWidth: 2 } }}
            style={{ background: '#f8fafc' }}>
            <MiniMap style={{ borderRadius: 8 }} />
            <Controls />
            <Background color="#e2e8f0" gap={20} />
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selectedNode && (
          <div style={{ width: 320, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, overflow: 'auto', flexShrink: 0 }}>
            <NodeConfigPanel node={selectedNode} onUpdate={updateNodeData} onDelete={deleteNode} allNodes={nodes} />
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

// ======================== Config Panel =======================
function NodeConfigPanel({ node, onUpdate, onDelete, allNodes }) {
  const [plugins, setPlugins] = useState([]);
  const [lightApps, setLightApps] = useState([]);
  const [providers, setProviders] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [depsLoaded, setDepsLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [kbLoaded, setKbLoaded] = useState(false);

  useEffect(() => {
    if (node.type === 'plugin' && !depsLoaded) {
      pluginAPI.list({ status: 'published' }).then(res => {
        setPlugins(res.data.plugins || []);
      }).catch(() => {});
      setDepsLoaded(true);
    }
    if (node.type === 'lightApp' && !depsLoaded) {
      pluginAPI.listLightApps().then(res => {
        setLightApps(res.data.lightApps || []);
      }).catch(() => {});
      setDepsLoaded(true);
    }
    if (node.type === 'llm' && !modelsLoaded) {
      modelAPI.list().then(res => {
        setProviders(res.data?.providers || []);
      }).catch(() => {}).finally(() => setModelsLoaded(true));
    }
    if (node.type === 'knowledge' && !kbLoaded) {
      knowledgeAPI.list().then(res => {
        setKnowledgeBases(res.data?.libraries || []);
      }).catch(() => {}).finally(() => setKbLoaded(true));
    }
  }, [node.type, depsLoaded, modelsLoaded, kbLoaded]);

  const vars = getVarsForFlow(allNodes);

  const TypeConf = {
    reply: () => (
      <>
        <Field label="回复内容"><VarTextarea rows={4} value={node.data.content || ''} onChange={v => onUpdate('content', v)} placeholder="回复文本，点击上方变量可插入..." vars={vars} /></Field>
        <Field label="格式"><select className="form-select" value={node.data.format || 'text'} onChange={e => onUpdate('format', e.target.value)}><option value="text">纯文本</option><option value="markdown">Markdown</option></select></Field>
      </>
    ),
    llm: () => {
      const enabledModels = [];
      providers.forEach(p => {
        (p.models || []).filter(m => m.enabled !== false).forEach(m => {
          enabledModels.push({ providerId: p.id, providerName: p.name, modelId: m.id, modelName: m.name, category: m.category });
        });
      });
      const isTemplate = (node.data.model || '').startsWith('{{');
      const selectedValue = isTemplate ? '__template__' : (node.data.model || '');
      return (
        <>
          <Field label="模型">
            {providers.length > 0 ? (
              <select className="form-select" value={selectedValue} onChange={e => {
                if (e.target.value === '__template__') {
                  onUpdate('model', '{{modelId}}');
                } else {
                  onUpdate('model', e.target.value);
                }
              }}>
                <option value="">-- 选择模型 --</option>
                {providers.map(p => {
                  const enabled = (p.models || []).filter(m => m.enabled !== false);
                  if (enabled.length === 0) return null;
                  return (
                    <optgroup key={p.id} label={`${p.icon || ''} ${p.name} ${p.status === 'online' ? '●' : '○'}`}>
                      {enabled.map(m => (
                        <option key={`${p.id}/${m.id}`} value={`${p.id}/${m.id}`}>
                          {m.name} ({m.id})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
                <option value="__template__">⚡ 使用变量...</option>
              </select>
            ) : (
              <input className="form-input" value={node.data.model || ''} onChange={e => onUpdate('model', e.target.value)} placeholder="例如：ollama/llama3 或 {{modelId}}" />
            )}
            {isTemplate && (
              <div style={{ marginTop: 6 }}>
                <input className="form-input" value={node.data.model || ''} onChange={e => onUpdate('model', e.target.value)} placeholder="{{modelId}}" style={{ fontSize: 12, fontFamily: 'monospace' }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>输入模板变量，例如 {{modelId}}</div>
              </div>
            )}
          </Field>
          <Field label="提示词"><VarTextarea rows={6} value={node.data.prompt || ''} onChange={v => onUpdate('prompt', v)} placeholder="系统提示词，点击上方变量可插入..." vars={vars} /></Field>
          <Field label="Temperature"><input className="form-input" type="number" min="0" max="2" step="0.1" value={node.data.temperature || 0.7} onChange={e => onUpdate('temperature', parseFloat(e.target.value))} /></Field>
        </>
      );
    },
    http: () => (
      <>
        <Field label="请求方法"><select className="form-select" value={node.data.method || 'GET'} onChange={e => onUpdate('method', e.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></Field>
        <Field label="URL"><input className="form-input" value={node.data.url || ''} onChange={e => onUpdate('url', e.target.value)} placeholder="https://..." /></Field>
        <Field label="Body"><textarea className="form-textarea" rows={3} value={node.data.body || ''} onChange={e => onUpdate('body', e.target.value)} placeholder="JSON body..." /></Field>
      </>
    ),
    condition: () => (
      <Field label="条件表达式"><input className="form-input" value={node.data.condition || ''} onChange={e => onUpdate('condition', e.target.value)} placeholder="{{result}} == '成功'" /><div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>使用 {{变量名}} 语法</div></Field>
    ),
    knowledge: () => (
      <>
        <Field label="知识库">
          {knowledgeBases.length > 0 ? (
            <select className="form-select" value={node.data.kbId || ''} onChange={e => onUpdate('kbId', e.target.value)}>
              <option value="">-- 选择知识库 --</option>
              {knowledgeBases.map(kb => (
                <option key={kb.id} value={kb.id}>
                  {kb.name} ({kb.id}) {kb.status === 'published' ? '· 已发布' : '· 草稿'}
                </option>
              ))}
            </select>
          ) : (
            <input className="form-input" value={node.data.kbId || ''} onChange={e => onUpdate('kbId', e.target.value)} placeholder="知识库ID（暂无可选知识库）" />
          )}
        </Field>
        <Field label="返回条数"><input className="form-input" type="number" min="1" max="20" value={node.data.topK || 3} onChange={e => onUpdate('topK', parseInt(e.target.value))} /></Field>
        <Field label="相似度阈值"><input className="form-input" type="number" min="0" max="1" step="0.05" value={node.data.threshold || 0.7} onChange={e => onUpdate('threshold', parseFloat(e.target.value))} /></Field>
        <Field label="输出变量"><input className="form-input" value={node.data.outputVar || 'knowledge'} onChange={e => onUpdate('outputVar', e.target.value)} /></Field>
      </>
    ),
    classifier: () => (
      <Field label="分类（每行一个）"><textarea className="form-textarea" rows={4} value={(node.data.categories || []).join('\n')} onChange={e => onUpdate('categories', e.target.value.split('\n').filter(Boolean))} placeholder="问题诊断&#10;业务咨询&#10;技术支持" /></Field>
    ),
    merge: () => (
      <Field label="合并策略"><select className="form-select" value={node.data.strategy || 'first'} onChange={e => onUpdate('strategy', e.target.value)}><option value="first">取第一个结果</option><option value="concat">拼接所有结果</option><option value="best">取最优结果</option></select></Field>
    ),
    code: () => (
      <>
        <Field label="语言"><select className="form-select" value={node.data.language || 'python'} onChange={e => onUpdate('language', e.target.value)}><option value="python">Python</option><option value="javascript">JavaScript</option><option value="sql">SQL</option></select></Field>
        <Field label="代码"><textarea className="form-textarea" rows={6} value={node.data.code || ''} onChange={e => onUpdate('code', e.target.value)} placeholder="print(result)" style={{ fontFamily: 'monospace', fontSize: 12 }} /></Field>
        <Field label="超时(秒)"><input className="form-input" type="number" value={node.data.timeout || 30} onChange={e => onUpdate('timeout', parseInt(e.target.value))} /></Field>
      </>
    ),
    loop: () => (
      <>
        <Field label="循环条件"><input className="form-input" value={node.data.condition || ''} onChange={e => onUpdate('condition', e.target.value)} placeholder="item < 10" /></Field>
        <Field label="最大次数"><input className="form-input" type="number" value={node.data.maxIterations || 10} onChange={e => onUpdate('maxIterations', parseInt(e.target.value))} /></Field>
        <Field label="迭代变量"><input className="form-input" value={node.data.iteratorVar || 'item'} onChange={e => onUpdate('iteratorVar', e.target.value)} /></Field>
      </>
    ),
    docParser: () => (
      <>
        <Field label="文件URL"><input className="form-input" value={node.data.fileUrl || ''} onChange={e => onUpdate('fileUrl', e.target.value)} placeholder="https:// 或 {{fileUrl}}" /></Field>
        <Field label="格式"><select className="form-select" value={node.data.format || 'auto'} onChange={e => onUpdate('format', e.target.value)}><option value="auto">自动识别</option><option value="pdf">PDF</option><option value="docx">DOCX</option><option value="csv">CSV</option></select></Field>
      </>
    ),
    agent: () => (
      <>
        <Field label="子智能体ID"><input className="form-input" value={node.data.agentId || ''} onChange={e => onUpdate('agentId', e.target.value)} placeholder="选择要调用的智能体" /></Field>
        <Field label="输入映射"><textarea className="form-textarea" rows={2} value={node.data.inputMapping || ''} onChange={e => onUpdate('inputMapping', e.target.value)} placeholder="question={{input}}" /></Field>
      </>
    ),
    plugin: () => (
      <>
        <Field label="选择插件">
          <select className="form-select" value={node.data.pluginId || ''} onChange={e => onUpdate('pluginId', e.target.value)}>
            <option value="">-- 选择插件 --</option>
            {plugins.map(p => <option key={p.id} value={p.id}>{p.name} ({p.config?.method} {p.config?.url})</option>)}
          </select>
        </Field>
        <Field label="输入映射"><textarea className="form-textarea" rows={2} value={node.data.inputMapping || ''} onChange={e => onUpdate('inputMapping', e.target.value)} placeholder="city={{city}}" /></Field>
      </>
    ),
    lightApp: () => (
      <>
        <Field label="选择轻应用">
          <select className="form-select" value={node.data.appId || ''} onChange={e => onUpdate('appId', e.target.value)}>
            <option value="">-- 选择轻应用 --</option>
            {lightApps.map(a => <option key={a.id} value={a.id}>{a.name} ({a.endpoint})</option>)}
          </select>
        </Field>
        <Field label="输入映射"><textarea className="form-textarea" rows={2} value={node.data.inputMapping || ''} onChange={e => onUpdate('inputMapping', e.target.value)} placeholder="question={{query}}" /></Field>
      </>
    ),
    notify: () => (
      <>
        <Field label="通知渠道"><select className="form-select" value={node.data.channel || 'dingtalk'} onChange={e => onUpdate('channel', e.target.value)}><option value="dingtalk">钉钉通知</option><option value="email">邮件通知</option></select></Field>
        <Field label="Webhook"><input className="form-input" value={node.data.webhook || ''} onChange={e => onUpdate('webhook', e.target.value)} placeholder="钉钉机器人 webhook" /></Field>
        <Field label="消息内容"><textarea className="form-textarea" rows={3} value={node.data.message || ''} onChange={e => onUpdate('message', e.target.value)} placeholder="通知内容" /></Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={node.data.atAll || false} onChange={e => onUpdate('atAll', e.target.checked)} />@所有人</label>
      </>
    ),
    lightAppQA: () => (
      <>
        <Field label="轻应用"><select className="form-select" value={node.data.appId || ''} onChange={e => onUpdate('appId', e.target.value)}>
          <option value="">-- 选择轻应用 --</option>
          {lightApps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></Field>
        <Field label="问题模板"><textarea className="form-textarea" rows={2} value={node.data.question || ''} onChange={e => onUpdate('question', e.target.value)} placeholder="{{userQuestion}}" /></Field>
      </>
    ),
    metricsQA: () => (
      <>
        <Field label="指标名称"><input className="form-input" value={node.data.metric || ''} onChange={e => onUpdate('metric', e.target.value)} placeholder="例如：销售额" /></Field>
        <Field label="时间范围"><input className="form-input" value={node.data.timeRange || ''} onChange={e => onUpdate('timeRange', e.target.value)} placeholder="本月 / 近7天" /></Field>
      </>
    ),
    dataQA: () => (
      <>
        <Field label="数据源"><input className="form-input" value={node.data.dataSource || ''} onChange={e => onUpdate('dataSource', e.target.value)} placeholder="数据库/表名" /></Field>
        <Field label="查询模板"><textarea className="form-textarea" rows={3} value={node.data.query || ''} onChange={e => onUpdate('query', e.target.value)} placeholder="SELECT * FROM table WHERE ..." /></Field>
      </>
    ),
    sqlQuery: () => (
      <>
        <Field label="数据库类型"><select className="form-select" value={node.data.dbType || 'mysql'} onChange={e => onUpdate('dbType', e.target.value)}><option value="mysql">MySQL / MariaDB</option><option value="postgresql">PostgreSQL</option></select></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="主机"><input className="form-input" value={node.data.host || 'localhost'} onChange={e => onUpdate('host', e.target.value)} /></Field>
          <Field label="端口"><input className="form-input" type="number" value={node.data.port || (node.data.dbType === 'postgresql' ? 5432 : 3306)} onChange={e => onUpdate('port', parseInt(e.target.value))} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="用户名"><input className="form-input" value={node.data.user || ''} onChange={e => onUpdate('user', e.target.value)} placeholder="root" /></Field>
          <Field label="密码"><input className="form-input" type="password" value={node.data.password || ''} onChange={e => onUpdate('password', e.target.value)} /></Field>
        </div>
        <Field label="数据库名"><input className="form-input" value={node.data.database || ''} onChange={e => onUpdate('database', e.target.value)} placeholder="业务库名称" /></Field>
        <Field label="SQL（支持 {{变量}}）"><textarea className="form-textarea" rows={4} value={node.data.sql || ''} onChange={e => onUpdate('sql', e.target.value)} placeholder="SELECT * FROM orders WHERE created_at > '{{startDate}}'" style={{ fontFamily: 'monospace', fontSize: 12 }} /></Field>
        <Field label="超时(秒)"><input className="form-input" type="number" min="5" max="120" value={node.data.timeout || 30} onChange={e => onUpdate('timeout', parseInt(e.target.value))} /></Field>
        <div style={{ fontSize: 11, color: '#f59e0b', background: '#fffbeb', padding: '6px 8px', borderRadius: 4, marginTop: 4 }}>
          ⚠️ 需要安装驱动：MySQL → <code>npm install mysql2</code> / PostgreSQL → <code>npm install pg</code>
        </div>
      </>
    )
  };

  const ConfigComp = TypeConf[node.type];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>⚙️ {node.data.label || getNodeLabel(node.type)}</div>
        <span className="node-type-badge" style={{ fontSize: 10 }}>{node.type}</span>
      </div>
      {node.type === 'start' && <p style={{ fontSize: 13, color: '#94a3b8' }}>工作流入口节点，无需配置。</p>}
      {NODE_INFO[node.type] && (
        <div style={{ fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 14, lineHeight: 1.6 }}>
          <div style={{ color: '#475569' }}>💡 {NODE_INFO[node.type].desc}</div>
          {NODE_INFO[node.type].howto && <div style={{ color: '#94a3b8', marginTop: 4 }}>📌 {NODE_INFO[node.type].howto}</div>}
          {NODE_INFO[node.type].example && <div style={{ color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>例：{NODE_INFO[node.type].example}</div>}
        </div>
      )}
      {node.type === 'end' && <Field label="输出变量"><input className="form-input" value={node.data.resultVar || ''} onChange={e => onUpdate('resultVar', e.target.value)} placeholder="例如：answer" /></Field>}
      {ConfigComp && <ConfigComp />}
      {!ConfigComp && node.type !== 'start' && node.type !== 'end' && <p style={{ fontSize: 13, color: '#94a3b8' }}>暂无配置项</p>}
      {node.type !== 'start' && (
        <button className="btn btn-outline btn-sm" style={{ marginTop: 16, width: '100%', color: '#ef4444' }} onClick={onDelete}>🗑 删除节点</button>
      )}
    </>
  );
}

function Field({ label, children }) {
  return <div className="form-group"><label className="form-label">{label}</label>{children}</div>;
}

// 带「变量点击插入」的文本框
function VarTextarea({ value, onChange, placeholder, rows = 4, vars = [] }) {
  const ref = useRef(null);
  const insert = (name) => {
    const token = `{{${name}}}`;
    const el = ref.current;
    const cur = value || '';
    if (!el) { onChange(cur + token); return; }
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {vars.map(v => (
          <button key={v.name} type="button" title={v.desc} onClick={() => insert(v.name)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 9999, border: '1px solid #2A83FF', background: '#E8F2FF', color: '#1F6AE0', cursor: 'pointer' }}>
            {`{{${v.name}}}`}
          </button>
        ))}
      </div>
      <textarea ref={ref} className="form-textarea" rows={rows} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ======================== Node Components =======================
const HANDLE_STYLE = { width: 12, height: 12, background: '#fff', border: '2px solid #2A83FF', borderRadius: '50%' };
const HANDLE_STYLE_TARGET = { width: 12, height: 12, background: '#fff', border: '2px solid #f59e0b', borderRadius: '50%' };
const baseNode = (icon, borderColor, bg) => ({
  padding: '12px 16px', borderRadius: 10, background: 'white',
  border: `2px solid ${borderColor}`, minWidth: 140,
  boxShadow: `0 2px 8px ${bg}20`, fontSize: 13, position: 'relative'
});

function StartNode({ data }) {
  return <div style={{ ...baseNode('🚀', '#10b981', '#10b981'), borderRadius: 20 }}>
    🚀 {data.label}
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function EndNode({ data }) {
  return <div style={{ ...baseNode('🏁', '#ef4444', '#ef4444'), borderRadius: 20 }}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    🏁 {data.label}
  </div>;
}

function ReplyNode({ data }) {
  return <div style={baseNode('💬', '#2A83FF', '#2A83FF')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#1F6AE0' }}>💬 {data.label}</div>
    {data.content && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.content}</div>}
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function LLMNode({ data }) {
  return <div style={baseNode('🧠', '#2A83FF', '#2A83FF')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#1F6AE0' }}>🧠 {data.label}</div>
    {data.prompt && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.prompt}</div>}
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function HTTPNode({ data }) {
  return <div style={baseNode('🌐', '#f59e0b', '#f59e0b')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#d97706' }}>🌐 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{data.method || 'GET'} {(data.url || '').substring(0, 20)}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function ConditionNode({ data }) {
  return <div style={baseNode('🔀', '#0EA5E9', '#0EA5E9')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#0369A1' }}>🔀 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{data.condition ? data.condition.substring(0, 30) : '未配置条件'}</div>
    <Handle type="source" position={Position.Bottom} id="true" style={{ ...HANDLE_STYLE, borderColor: '#10b981', left: '30%' }} />
    <Handle type="source" position={Position.Bottom} id="false" style={{ ...HANDLE_STYLE, borderColor: '#ef4444', left: '70%' }} />
    <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 4, fontSize: 11, color: '#94a3b8' }}><span>{data.trueLabel || '是'}</span><span>{data.falseLabel || '否'}</span></div>
  </div>;
}

function KnowledgeNode({ data }) {
  return <div style={baseNode('📚', '#3b82f6', '#3b82f6')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#2563eb' }}>📚 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>TopK: {data.topK || 3}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function ClassifierNode({ data }) {
  return <div style={baseNode('🔍', '#0EA5E9', '#0EA5E9')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#0369A1' }}>🔍 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{(data.categories || []).slice(0, 3).join(', ')}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function MergeNode({ data }) {
  return <div style={baseNode('🔗', '#06b6d4', '#06b6d4')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#0891b2' }}>🔗 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{data.strategy === 'first' ? '取第一个' : data.strategy === 'concat' ? '拼接' : '取最优'}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function CodeNode({ data }) {
  return <div style={baseNode('💻', '#ec4899', '#ec4899')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#db2777' }}>💻 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{data.language || 'python'}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function LoopNode({ data }) {
  return <div style={baseNode('🔄', '#f59e0b', '#f59e0b')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#d97706' }}>🔄 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>max: {data.maxIterations || 10}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function DocParserNode({ data }) {
  return <div style={baseNode('📃', '#14b8a6', '#14b8a6')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#0f766e' }}>📃 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{data.format || 'auto'}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function AgentNode({ data }) {
  return <div style={baseNode('🤖', '#a855f7', '#a855f7')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#9333ea' }}>🤖 {data.label}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function PluginNode({ data }) {
  return <div style={baseNode('🔌', '#10b981', '#10b981')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#059669' }}>🔌 {data.label}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function LightAppNode({ data }) {
  return <div style={baseNode('📱', '#3b82f6', '#3b82f6')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#2563eb' }}>📱 {data.label}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function NotifyNode({ data }) {
  return <div style={baseNode('📣', '#f97316', '#f97316')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#ea580c' }}>📣 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{data.channel === 'email' ? '邮件' : '钉钉'}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function LightAppQANode({ data }) {
  return <div style={baseNode('💡', '#0ea5e9', '#0ea5e9')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#0284c7' }}>💡 {data.label}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function MetricsQANode({ data }) {
  return <div style={baseNode('📊', '#84cc16', '#84cc16')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#65a30d' }}>📊 {data.label}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{data.metric || ''}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function DataQANode({ data }) {
  return <div style={baseNode('📋', '#f43f5e', '#f43f5e')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#e11d48' }}>📋 {data.label}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}

function SqlQueryNode({ data }) {
  return <div style={baseNode('🗄️', '#0891b2', '#0891b2')}>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE_TARGET} />
    <div style={{ fontWeight: 600, color: '#0e7490' }}>🗄️ {data.label}</div>
    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{data.dbType || 'mysql'}://{data.database || '?'}</div>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
  </div>;
}
