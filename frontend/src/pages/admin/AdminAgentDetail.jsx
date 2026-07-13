import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agentAPI } from '../../api';

export default function AdminAgentDetail() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAgent();
  }, [agentId]);

  const loadAgent = async () => {
    try {
      const [agentRes, catRes] = await Promise.all([
        agentAPI.get(agentId),
        agentAPI.listCategories()
      ]);
      setAgent(agentRes.data);
      setCategories(catRes.data.categories || []);
    } catch (e) {
      setError('加载智能体失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate('/admin/agents')}>← 返回</button>
          <h2>📋 智能体详情</h2>
        </div>
        <div className="loading">加载中...</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate('/admin/agents')}>← 返回</button>
          <h2>📋 智能体详情</h2>
        </div>
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <p>{error || '智能体不存在'}</p>
          <button className="btn" onClick={() => navigate('/admin/agents')}>返回列表</button>
        </div>
      </div>
    );
  }

  const category = categories.find(c => c.id === agent.categoryId);
  const config = agent.config || {};
  const features = config.features || {};

  // Check for configuration issues
  const issues = [];
  if (!config.modelId) {
    issues.push({ type: 'error', message: '未配置模型服务，智能体发布后将无法正常使用' });
  }
  if (!config.prompts || config.prompts.length === 0 || !config.prompts[0]?.content) {
    issues.push({ type: 'warning', message: '未设置系统提示词，建议添加以优化智能体行为' });
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/admin/agents')}>← 返回列表</button>
        <div style={{ flex: 1 }}>
          <h2>📋 {agent.name} - 详情</h2>
          <p className="page-desc">
            <span className={`status-badge ${agent.status}`}>
              {agent.status === 'published' ? '已发布' : '草稿'}
            </span>
            <span style={{ marginLeft: 12 }}>
              创建于 {new Date(agent.createdAt).toLocaleString('zh-CN')}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/admin/agents/${agentId}/config`)}>
            ⚙️ 编辑配置
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/admin/agents/${agentId}/metrics`)}>
            📊 监测
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/admin/agents/${agentId}/evaluate`)}>
            🧪 评测
          </button>
        </div>
      </div>

      {/* Configuration Issues */}
      {issues.length > 0 && (
        <div className="issues-section">
          <h3>⚠️ 配置问题</h3>
          {issues.map((issue, i) => (
            <div key={i} className={`issue-item ${issue.type}`}>
              <span className="issue-icon">{issue.type === 'error' ? '🔴' : '🟡'}</span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="detail-grid">
        {/* Basic Info */}
        <div className="detail-card">
          <h3>基本信息</h3>
          <div className="detail-table">
            <div className="detail-row">
              <span className="detail-label">名称</span>
              <span className="detail-value">{agent.name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">描述</span>
              <span className="detail-value">{agent.description || '无描述'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">图标</span>
              <span className="detail-value" style={{ fontSize: 24 }}>{agent.avatar || '🤖'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">类型</span>
              <span className="detail-value">{agent.type === 'chat' ? '💬 对话型' : '📝 生成型'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">构建模式</span>
              <span className="detail-value">{agent.buildMode === 'simple' ? '简单模式' : '🔀 编排模式'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">所属分类</span>
              <span className="detail-value">{category?.name || '未分类'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">状态</span>
              <span className="detail-value">
                <span className={`status-badge ${agent.status}`}>
                  {agent.status === 'published' ? '已发布' : '草稿'}
                </span>
              </span>
            </div>
            {agent.publishedAt && (
              <div className="detail-row">
                <span className="detail-label">发布时间</span>
                <span className="detail-value">{new Date(agent.publishedAt).toLocaleString('zh-CN')}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">更新时间</span>
              <span className="detail-value">{new Date(agent.updatedAt).toLocaleString('zh-CN')}</span>
            </div>
          </div>
        </div>

        {/* Model Config */}
        <div className="detail-card">
          <h3>模型配置</h3>
          <div className="detail-table">
            <div className="detail-row">
              <span className="detail-label">模型ID</span>
              <span className="detail-value">
                {config.modelId ? (
                  <code>{config.modelId}</code>
                ) : (
                  <span style={{ color: 'var(--danger)', fontSize: 13 }}>⚠ 未配置</span>
                )}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">温度 (Temperature)</span>
              <span className="detail-value">{config.temperature ?? 0.7}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Top P</span>
              <span className="detail-value">{config.topP ?? 0.9}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">最大输出 Token</span>
              <span className="detail-value">{config.maxOutput ?? 2048}</span>
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div className="detail-card">
          <h3>系统提示词</h3>
          {config.prompts && config.prompts.length > 0 && config.prompts[0]?.content ? (
            <div className="prompt-box">
              <pre>{config.prompts[0].content}</pre>
            </div>
          ) : (
            <div className="empty-section">
              <span style={{ color: 'var(--warning)', fontSize: 13 }}>⚠ 未设置系统提示词</span>
            </div>
          )}
          {config.greeting && (
            <>
              <h4 style={{ marginTop: 16 }}>欢迎语</h4>
              <div className="prompt-box">
                <pre>{config.greeting}</pre>
              </div>
            </>
          )}
        </div>

        {/* Knowledge Bases */}
        <div className="detail-card">
          <h3>知识库 ({config.knowledgeBases?.length || 0})</h3>
          {config.knowledgeBases && config.knowledgeBases.length > 0 ? (
            <div className="tag-list">
              {config.knowledgeBases.map((kb, i) => (
                <span key={i} className="tag">{kb.name || kb.id || kb}</span>
              ))}
            </div>
          ) : (
            <div className="empty-section">
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>未关联知识库</p>
            </div>
          )}
        </div>

        {/* Plugins */}
        <div className="detail-card">
          <h3>插件 ({config.plugins?.length || 0})</h3>
          {config.plugins && config.plugins.length > 0 ? (
            <div className="tag-list">
              {config.plugins.map((p, i) => (
                <span key={i} className="tag">{p.name || p.id || p}</span>
              ))}
            </div>
          ) : (
            <div className="empty-section">
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>未关联插件</p>
            </div>
          )}
        </div>

        {/* Variables */}
        <div className="detail-card">
          <h3>变量 ({config.variables?.length || 0})</h3>
          {config.variables && config.variables.length > 0 ? (
            <table className="variable-table">
              <thead>
                <tr>
                  <th>变量名</th>
                  <th>类型</th>
                  <th>默认值</th>
                  <th>描述</th>
                </tr>
              </thead>
              <tbody>
                {config.variables.map((v, i) => (
                  <tr key={i}>
                    <td><code>{`{{${v.name}}}`}</code></td>
                    <td>{v.type || 'text'}</td>
                    <td>{v.default || '-'}</td>
                    <td>{v.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-section">
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>无变量</p>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="detail-card">
          <h3>功能开关</h3>
          <div className="detail-table">
            <div className="detail-row">
              <span className="detail-label">推荐问题</span>
              <span className="detail-value">
                {features.nextQuestions ? '✅ 开启' : '❌ 关闭'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">原文渲染</span>
              <span className="detail-value">
                {features.rawTextRender ? '✅ 开启' : '❌ 关闭'}
              </span>
            </div>
          </div>
        </div>

        {/* Suggested Questions */}
        {config.suggestedQuestions && config.suggestedQuestions.length > 0 && (
          <div className="detail-card">
            <h3>推荐问题</h3>
            <div className="questions-list">
              {config.suggestedQuestions.map((q, i) => (
                <div key={i} className="question-item">
                  <span className="question-num">{i + 1}</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workflow Nodes */}
        {agent.buildMode === 'workflow' && agent.workflow && (
          <div className="detail-card">
            <h3>编排节点 ({agent.workflow.nodes?.length || 0})</h3>
            {agent.workflow.nodes && agent.workflow.nodes.length > 0 ? (
              <div className="workflow-nodes">
                {agent.workflow.nodes.map((node, i) => (
                  <div key={i} className="workflow-node-card">
                    <div className="node-header">
                      <span className="node-type-badge">{node.type}</span>
                      <span className="node-name">{node.data?.label || node.id}</span>
                    </div>
                    {node.data?.config && (
                      <div className="node-config">
                        {Object.entries(node.data.config).map(([key, val]) => (
                          <div key={key} className="node-config-item">
                            <code>{key}</code>: {String(val)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {agent.workflow.edges && (
                  <div className="workflow-summary">
                    <span>连接数: {agent.workflow.edges.length}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-section">
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>工作流为空，请前往编排模式编辑</p>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => navigate(`/admin/workflow/${agentId}`)}
                  style={{ marginTop: 8 }}
                >
                  去编排
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick Phrases */}
        {agent.phrases && agent.phrases.length > 0 && (
          <div className="detail-card">
            <h3>快捷短语 ({agent.phrases.length})</h3>
            <div className="phrases-list">
              {agent.phrases.map(p => (
                <div key={p.id} className="phrase-item">
                  <span>{p.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
