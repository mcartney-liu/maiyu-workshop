import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { agentAPI } from '../../api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ agents: 0, published: 0, categories: 0, convCount: 0 });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [agentRes, catRes] = await Promise.all([
        agentAPI.list({}),
        agentAPI.listCategories()
      ]);
      const agents = agentRes.data.agents || [];
      const cats = catRes.data.categories || [];
      
      setStats({
        agents: agents.length,
        published: agents.filter(a => a.status === 'published').length,
        categories: cats.length,
        drafts: agents.filter(a => a.status === 'draft').length
      });
    } catch {}
  };

  const cards = [
    { icon: '🤖', label: '智能体总数', value: stats.agents, color: '#2A83FF', bg: '#E8F2FF' },
    { icon: '✅', label: '已发布', value: stats.published, color: '#10b981', bg: '#ecfdf5' },
    { icon: '📝', label: '草稿', value: stats.drafts, color: '#f59e0b', bg: '#fffbeb' },
    { icon: '📁', label: '分类数', value: stats.categories, color: '#2A83FF', bg: '#E8F2FF' }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>📊 运营仪表盘</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>概览你的智能体运营情况，快速进入常用功能</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.map(card => (
          <div key={card.label} style={{
            background: 'white', borderRadius: 14, padding: '22px',
            border: '1px solid #edf0f5', display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'all 0.2s',
            cursor: 'default'
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(42,131,255,0.12)'; e.currentTarget.style.borderColor = '#9FCBFF'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#edf0f5'; }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
            }}>
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📌 快速操作</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: '创建新智能体', path: '/admin/agents', icon: '🤖' },
              { label: '管理知识库', path: '/admin/knowledge', icon: '📚' },
              { label: '配置模型服务', path: '/admin/models', icon: '⚡' },
              { label: '管理插件', path: '/admin/plugins', icon: '🔌' }
            ].map(item => (
              <Link key={item.path} to={item.path} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 14px', borderRadius: 8,
                background: '#f8fafc', color: '#374151',
                textDecoration: 'none', fontSize: 14,
                border: '1px solid #e2e8f0',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#E8F2FF'; e.currentTarget.style.borderColor = '#9FCBFF'; e.currentTarget.style.color = '#2A83FF'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#374151'; }}
              >
                <span>{item.icon}</span> {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>💡 系统信息</h3>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 2 }}>
            <div>📦 系统版本: <strong>麦语工坊 v1.0</strong></div>
            <div>💾 数据存储: <strong>本地 JSON 文件</strong></div>
            <div>🔗 模型服务: <strong>Ollama / OpenAI / 智谱AI</strong></div>
            <div>🔐 用户系统: <strong>基础认证</strong></div>
            <div style={{ marginTop: 12, padding: '12px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
              <strong style={{ color: '#d97706' }}>🔄 启用向量检索：</strong>
              <div style={{ marginTop: 4 }}>
                运行 <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>ollama pull nomic-embed-text</code> 提升知识库检索精度
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
