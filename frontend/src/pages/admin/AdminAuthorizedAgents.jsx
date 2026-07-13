import React, { useState, useEffect } from 'react';
import { agentAPI } from '../../api';

export default function AdminAuthorizedAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuthorizedAgents();
  }, []);

  const loadAuthorizedAgents = async () => {
    try {
      const res = await agentAPI.getAuthorized();
      setAgents(res.data.agents || []);
    } catch (e) {
      console.error('加载授权智能体失败:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2>🔐 授权智能体</h2>
          <p className="page-desc">查看其他用户授权的智能体</p>
        </div>
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>🔐 授权智能体</h2>
        <p className="page-desc">查看其他用户授权的智能体，可直接使用但不可修改配置</p>
      </div>

      {agents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <p>暂无授权的智能体</p>
          <p className="empty-hint">授权智能体功能将在多用户版本中提供支持</p>
        </div>
      ) : (
        <div className="agent-grid">
          {agents.map(agent => (
            <div key={agent.id} className="agent-card">
              <div className="agent-card-header">
                <span className="agent-avatar">{agent.avatar || '🤖'}</span>
                <div className="agent-card-info">
                  <h4>{agent.name}</h4>
                  <p>{agent.description || '无描述'}</p>
                </div>
                <span className={`status-badge ${agent.status}`}>
                  {agent.status === 'published' ? '已发布' : '草稿'}
                </span>
              </div>
              <div className="agent-card-meta">
                <span>类型: {agent.type === 'chat' ? '对话型' : '生成型'}</span>
                <span>模式: {agent.buildMode === 'simple' ? '简单模式' : '编排模式'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
