import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agentAPI } from '../../api';

export default function AdminAgentEvaluate() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [testCases, setTestCases] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAgent();
  }, [agentId]);

  const loadAgent = async () => {
    try {
      const res = await agentAPI.get(agentId);
      setAgent(res.data);
    } catch (e) {
      setError('加载智能体失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const parseTestCases = (text) => {
    const lines = text.split('\n').filter(l => l.trim());
    const cases = [];

    let currentInput = '';
    let currentExpected = '';

    for (const line of lines) {
      if (line.startsWith('Q:') || line.startsWith('问题:') || line.startsWith('输入:')) {
        if (currentInput) {
          cases.push({ input: currentInput, expected: currentExpected || '' });
        }
        currentInput = line.replace(/^(Q:|问题:|输入:)\s*/, '').trim();
        currentExpected = '';
      } else if (line.startsWith('A:') || line.startsWith('答案:') || line.startsWith('预期:')) {
        currentExpected = line.replace(/^(A:|答案:|预期:)\s*/, '').trim();
      } else if (currentInput) {
        if (!currentExpected) {
          currentExpected = line.trim();
        }
      }
    }

    if (currentInput) {
      cases.push({ input: currentInput, expected: currentExpected || '' });
    }

    return cases;
  };

  const formatExample = `Q: 今天天气怎么样？
A: 请告诉我您的城市

Q: 什么是人工智能？
A: 人工智能是计算机科学的一个分支`;

  const handleEvaluate = async () => {
    const cases = parseTestCases(testCases);
    if (cases.length === 0) {
      setError('请至少添加一个测试用例（使用 Q:/A: 格式）');
      return;
    }

    setEvaluating(true);
    setError('');
    setResult(null);

    try {
      const res = await agentAPI.evaluate(agentId, cases);
      const initialData = res.data;
      setResult(initialData);
      
      // Poll for results
      if (initialData.taskId) {
        pollResults(initialData.taskId);
      }
    } catch (e) {
      setError('评测失败: ' + e.message);
      setEvaluating(false);
    }
  };

  const pollResults = async (taskId) => {
    const maxPolls = 60; // 2 minutes max
    let polls = 0;
    
    const interval = setInterval(async () => {
      polls++;
      try {
        const res = await agentAPI.getEvaluateResult(agentId, taskId);
        setResult(res.data);
        
        if (res.data.status === 'completed' || polls >= maxPolls) {
          clearInterval(interval);
          setEvaluating(false);
        }
      } catch (e) {
        clearInterval(interval);
        setEvaluating(false);
        setError('获取评测结果失败: ' + e.message);
      }
    }, 2000);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setTestCases(event.target.result);
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate(`/admin/agents/${agentId}/detail`)}>← 返回详情</button>
          <h2>🧪 智能体评测</h2>
        </div>
        <div className="loading">加载中...</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate(`/admin/agents/${agentId}/detail`)}>← 返回详情</button>
          <h2>🧪 智能体评测</h2>
        </div>
        <div className="error-state">
          <p>{error || '智能体不存在'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate(`/admin/agents/${agentId}/detail`)}>← 返回详情</button>
        <div style={{ flex: 1 }}>
          <h2>🧪 {agent.name} - 评测</h2>
          <p className="page-desc">
            上传测试用例，批量评测智能体回答质量
          </p>
        </div>
      </div>

      <div className="evaluate-layout">
        {/* Left: Test Case Input */}
        <div className="evaluate-panel">
          <div className="panel-header">
            <h3>测试用例</h3>
            <div className="panel-actions">
              <label className="btn btn-secondary btn-sm">
                📁 上传文件
                <input 
                  type="file" 
                  accept=".txt,.csv,.md" 
                  onChange={handleFileUpload} 
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <div className="format-hint">
            <strong>格式说明：</strong>每个测试用例包含 Q:（问题）和 A:（预期答案）
            <button 
              className="btn-text" 
              onClick={() => setTestCases(formatExample)}
            >
              填充示例
            </button>
          </div>

          <textarea
            className="testcase-input"
            value={testCases}
            onChange={(e) => setTestCases(e.target.value)}
            placeholder={formatExample}
            rows={15}
          />

          <div className="panel-footer">
            <span className="case-count">
              已录入 {parseTestCases(testCases).length} 条测试用例
            </span>
            <button 
              className="btn btn-primary"
              onClick={handleEvaluate}
              disabled={evaluating || agent.status !== 'published'}
            >
              {evaluating ? '⏳ 评测中...' : '🚀 开始评测'}
            </button>
            {agent.status !== 'published' && (
              <p className="warning-text">⚠️ 智能体未发布，无法进行评测</p>
            )}
          </div>
        </div>

        {/* Right: Results */}
        <div className="evaluate-panel">
          <div className="panel-header">
            <h3>评测结果</h3>
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          {result ? (
            <div className="evaluate-results">
              <div className="results-summary">
                <div className="summary-item">
                  <span className="summary-value">{result.totalCases}</span>
                  <span className="summary-label">总用例数</span>
                </div>
                <div className="summary-item">
                  <span className="summary-value">{result.completedCases || 0}</span>
                  <span className="summary-label">已完成</span>
                </div>
                <div className="summary-item">
                  <span className="summary-value">{result.status}</span>
                  <span className="summary-label">状态</span>
                </div>
              </div>

              <div className="results-table-wrapper">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>输入</th>
                      <th>预期答案</th>
                      <th>实际回答</th>
                      <th>得分</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={i}>
                        <td>{r.id || i + 1}</td>
                        <td className="text-cell">{r.input}</td>
                        <td className="text-cell">{r.expected}</td>
                        <td className="text-cell">
                          {r.actual || (
                            <span className="pending-text">{r.status === 'running' ? '评测中...' : '等待中...'}</span>
                          )}
                        </td>
                        <td>
                          {r.score != null ? (
                            <span style={{ 
                              color: r.score >= 60 ? '#10b981' : r.score >= 30 ? '#f59e0b' : '#ef4444',
                              fontWeight: 600 
                            }}>{r.score}%</span>
                          ) : (r.status === 'error' ? '-' : '...')}
                        </td>
                        <td>
                          <span className={`status-dot ${r.status}`}></span>
                          {r.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>暂无评测结果</p>
              <p className="empty-hint">在左侧录入测试用例并点击"开始评测"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
