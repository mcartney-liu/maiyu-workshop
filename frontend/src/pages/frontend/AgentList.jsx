import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentAPI } from '../../api';

export default function AgentList() {
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, [selectedCat, keyword]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCat !== 'all') params.categoryId = selectedCat;
      if (keyword) params.keyword = keyword;
      params.status = 'published';

      const [agentsRes, catRes] = await Promise.all([
        agentAPI.list(params),
        agentAPI.listCategories()
      ]);
      setAgents((agentsRes.data.agents || []).filter(a => a.status === 'published'));
      setCategories(catRes.data.categories || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c.name; });
  const chips = [{ id: 'all', name: '全部' }, ...categories];

  return (
    <div className="home-wrap">
      {/* 页头：品牌 + 搜索 */}
      <header className="hp-header">
        <div className="hp-header-inner">
          <div className="hp-title">
            <h1>智能助手</h1>
            <p>选择一个助手开始对话，或搜索你需要的功能</p>
          </div>
          <div className="hp-search">
            <span className="hp-search-ico">🔍</span>
            <input
              placeholder="搜索智能体…"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
            {keyword && (
              <button className="hp-search-clear" onClick={() => setKeyword('')}>×</button>
            )}
          </div>
        </div>
      </header>

      {/* 分类筛选 */}
      <div className="hp-filter-bar">
        <div className="hp-filter-inner">
          {chips.map(cat => (
            <button
              key={cat.id}
              className={`hp-chip ${selectedCat === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCat(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 智能体卡片网格 */}
      <main className="hp-main">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="hp-card hp-skeleton">
              <div className="hp-card-icon skeleton" />
              <div className="hp-card-info">
                <div className="skeleton" style={{ width: '45%', height: 15, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: '100%', height: 12, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: '65%', height: 12 }} />
              </div>
            </div>
          ))
        ) : agents.length === 0 ? (
          <div className="hp-empty">
            <span className="hp-empty-ico">🤖</span>
            <h3>暂无可用的智能体</h3>
            <p>管理员在后台创建并发布后会出现在这里</p>
          </div>
        ) : (
          agents.map(agent => (
            <div
              key={agent.id}
              className="hp-card"
              onClick={() => navigate(`/chat/${agent.id}`)}
            >
              <div className="hp-card-icon">{agent.avatar || '🤖'}</div>
              <div className="hp-card-info">
                <div className="hp-card-row">
                  <h4>{agent.name}</h4>
                  <span className={`hp-tag ${agent.type === 'chat' ? 'tag-chat' : 'tag-gen'}`}>
                    {agent.type === 'chat' ? '💬 对话' : '⚡ 生成'}
                  </span>
                </div>
                <p>{agent.description || '一个 AI 智能助手'}</p>
                <div className="hp-card-foot">
                  <span className="hp-cat">{catMap[agent.categoryId] || '未分类'}</span>
                  <span className="hp-arrow">打开 →</span>
                </div>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
