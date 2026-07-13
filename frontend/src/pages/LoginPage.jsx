import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState('');
  
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isRegister) {
        await register(username, password, displayName);
        await login(username, password);
      } else {
        await login(username, password);
      }
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#F5F7FA'
    }}>
      {/* 左侧品牌区 */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(160deg, #1A1F3E 0%, #262E5C 50%, #2A83FF 130%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 56px',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* 装饰光斑 */}
        <div style={{
          position: 'absolute', top: '-120px', right: '-80px',
          width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(42,131,255,0.35) 0%, transparent 70%)'
        }} />
        <div style={{
          position: 'absolute', bottom: '-100px', left: '-60px',
          width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)'
        }} />
        
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, border: '1px solid rgba(255,255,255,0.2)'
            }}>
              🛠️
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>麦语工坊</span>
          </div>
          
          <h1 style={{
            fontSize: 38, fontWeight: 800, lineHeight: 1.3,
            letterSpacing: '-1px', margin: '0 0 20px'
          }}>
            打造你的<br />专属 AI 智能体
          </h1>
          
          <p style={{
            fontSize: 16, lineHeight: 1.8, color: 'rgba(255,255,255,0.75)',
            margin: '0 0 40px', maxWidth: 380
          }}>
            可视化工作流编排，接入大模型与知识库，几分钟搭建从问答到问数的智能助手。
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: '🎨', text: '可视化编排，拖拽连线即可搭建工作流' },
              { icon: '📚', text: '知识库 + 大模型，支持文档与数据问答' },
              { icon: '⚡', text: '一键发布，对话型 / 生成型灵活切换' }
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>{f.icon}</span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div style={{
        width: 460,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        flexShrink: 0
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ marginBottom: 36 }}>
            <h2 style={{
              fontSize: 24, fontWeight: 700, color: '#1A1F3E',
              margin: '0 0 8px', letterSpacing: '-0.5px'
            }}>
              {isRegister ? '创建账号' : '欢迎回来'}
            </h2>
            <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>
              {isRegister ? '注册一个管理员账号开始使用' : '登录以进入管理后台'}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <div className="form-group">
                <label className="form-label">显示名称</label>
                <input
                  className="form-input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="可选"
                />
              </div>
            )}
            
            <div className="form-group">
              <label className="form-label">用户名</label>
              <input
                className="form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
                autoFocus
                style={{ height: 44 }}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">密码</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                style={{ height: 44 }}
              />
            </div>
            
            {error && (
              <div style={{
                padding: '11px 14px',
                background: '#FEF2F2',
                color: '#DC2626',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
                border: '1px solid #FECACA',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}
            
            <button
              type="submit"
              className="btn btn-accent"
              disabled={loading}
              style={{ width: '100%', height: 44, fontSize: 15, fontWeight: 600 }}
            >
              {loading ? <span className="spinner spinner-sm" /> : isRegister ? '注册' : '登 录'}
            </button>
          </form>

          <div style={{
            textAlign: 'center',
            marginTop: 28,
            paddingTop: 20,
            borderTop: '1px solid #ECEEF2'
          }}>
            <button
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#2A83FF', fontSize: 13, fontWeight: 500
              }}
            >
              {isRegister ? '← 已有账号？返回登录' : '还没有账号？注册新账号'}
            </button>
          </div>

          {!isRegister && (
            <div style={{
              marginTop: 16, textAlign: 'center',
              fontSize: 12, color: '#94A3B8'
            }}>
              默认账号 admin / admin123
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
