import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agentAPI } from '../../api';

export default function AdminAgentMetrics() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMetrics();
  }, [agentId]);

  const loadMetrics = async () => {
    try {
      const res = await agentAPI.getMetrics(agentId);
      setMetrics(res.data);
    } catch (e) {
      setError('加载监测数据失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate(`/admin/agents/${agentId}/detail`)}>← 返回详情</button>
          <h2>📊 智能体监测</h2>
        </div>
        <div className="loading">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate(`/admin/agents/${agentId}/detail`)}>← 返回详情</button>
          <h2>📊 智能体监测</h2>
        </div>
        <div className="error-state">
          <p>{error}</p>
          <button className="btn" onClick={loadMetrics}>重试</button>
        </div>
      </div>
    );
  }

  const data = metrics || {};

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate(`/admin/agents/${agentId}/detail`)}>← 返回详情</button>
        <div style={{ flex: 1 }}>
          <h2>📊 {data.agentName || '智能体'} - 使用监测</h2>
          <p className="page-desc">
            实时监控智能体使用情况和性能指标
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadMetrics}>
          🔄 刷新数据
        </button>
      </div>

      {/* Stats Cards */}
      <div className="metrics-grid">
        <div className="metric-card primary">
          <div className="metric-icon">💬</div>
          <div className="metric-info">
            <span className="metric-value">{data.totalMessages || 0}</span>
            <span className="metric-label">消息总数</span>
          </div>
        </div>
        <div className="metric-card success">
          <div className="metric-icon">📁</div>
          <div className="metric-info">
            <span className="metric-value">{data.totalConversations || 0}</span>
            <span className="metric-label">会话总数</span>
          </div>
        </div>
        <div className="metric-card warning">
          <div className="metric-icon">📅</div>
          <div className="metric-info">
            <span className="metric-value">{data.todayMessages || 0}</span>
            <span className="metric-label">今日消息</span>
          </div>
        </div>
        <div className="metric-card info">
          <div className="metric-icon">🔄</div>
          <div className="metric-info">
            <span className="metric-value">{data.todayConversations || 0}</span>
            <span className="metric-label">今日会话</span>
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3>智能体信息</h3>
        <div className="detail-table">
          <div className="detail-row">
            <span className="detail-label">智能体名称</span>
            <span className="detail-value">{data.agentName}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">状态</span>
            <span className="detail-value">
              <span className={`status-badge ${data.status}`}>
                {data.status === 'published' ? '已发布' : '草稿'}
              </span>
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">创建时间</span>
            <span className="detail-value">
              {data.createdAt ? new Date(data.createdAt).toLocaleString('zh-CN') : '-'}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">发布时间</span>
            <span className="detail-value">
              {data.publishedAt ? new Date(data.publishedAt).toLocaleString('zh-CN') : '未发布'}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">平均消息/会话</span>
            <span className="detail-value">
              {data.totalConversations > 0 
                ? (data.totalMessages / data.totalConversations).toFixed(1) 
                : '0'}
            </span>
          </div>
        </div>
      </div>

      {/* Simple chart visualization */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3>消息趋势（今日）</h3>
        <div className="chart-placeholder">
          <div className="bar-chart">
            <div className="bar-item">
              <div className="bar" style={{ height: `${Math.min(100, (data.todayMessages || 0) * 10)}px` }}>
                <span className="bar-value">{data.todayMessages || 0}</span>
              </div>
              <span className="bar-label">今日消息</span>
            </div>
            <div className="bar-item">
              <div className="bar highlight" style={{ height: `${Math.min(100, (data.todayConversations || 0) * 10)}px` }}>
                <span className="bar-value">{data.todayConversations || 0}</span>
              </div>
              <span className="bar-label">今日会话</span>
            </div>
            <div className="bar-item">
              <div className="bar" style={{ height: `${Math.min(100, ((data.totalMessages || 0) / Math.max(1, data.totalConversations || 1)) * 5)}px` }}>
                <span className="bar-value">
                  {data.totalConversations > 0 
                    ? (data.totalMessages / data.totalConversations).toFixed(1) 
                    : '0'}
                </span>
              </div>
              <span className="bar-label">平均消息数</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
