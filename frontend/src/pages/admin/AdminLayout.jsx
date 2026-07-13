import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';

const NAV_ITEMS = [
  { path: '/admin/dashboard', icon: '📊', label: '仪表盘', desc: '查看整体运营数据' },
  { path: '/admin/agents', icon: '🤖', label: '智能体', desc: '创建与管理 AI 助手' },
  { path: '/admin/workflow', icon: '🔀', label: '工作流', desc: '编排智能体的运行步骤' },
  { path: '/admin/knowledge', icon: '📚', label: '知识库', desc: '上传资料让助手基于它回答' },
  { path: '/admin/plugins', icon: '🔌', label: '插件库', desc: '扩展助手的外部能力' },
  { path: '/admin/business', icon: '📖', label: '业务知识', desc: '沉淀行业规范与规则' },
  { path: '/admin/authorized-agents', icon: '🔐', label: '授权智能体', desc: '管理可对外调用的智能体' },
  { path: '/admin/models', icon: '⚡', label: '模型管理', desc: '配置问答使用的 AI 模型' }
];

function AdminSidebar({ user, logout, navigate, location, onPasswordClick }) {
  return (
    <aside style={{
      width: 220,
      background: '#ffffff',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto'
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{ fontSize: 22 }}>🌾</span>
          <div>
            <div style={{ color: '#1e293b', fontWeight: 700, fontSize: 16 }}>麦语工坊</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>管理后台</div>
          </div>
        </Link>
      </div>
      
      {/* Nav */}
      <nav style={{ padding: '12px 8px', flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.desc}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                color: active ? '#2A83FF' : '#64748b',
                background: active ? '#E8F2FF' : 'transparent',
                marginBottom: 4,
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                transition: 'all 0.2s',
                textDecoration: 'none'
              }}
            >
              <span style={{ fontSize: 17 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      {/* User info */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid #e2e8f0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', marginBottom: 8,
          borderRadius: 8, background: '#f8fafc'
        }}>
          <span style={{ fontSize: 14 }}>👤</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 500 }}>{user?.displayName || user?.username}</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>{user?.role === 'admin' ? '管理员' : '用户'}</div>
          </div>
          <button
            onClick={onPasswordClick}
            style={{
              padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0',
              background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer'
            }}
            title="修改密码"
          >
            🔑
          </button>
          <button
            onClick={async () => { await logout(); navigate('/login'); }}
            style={{
              padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0',
              background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer'
            }}
            title="退出登录"
          >
            退出
          </button>
        </div>
      </div>
      
      {/* Back to frontend */}
      <div style={{ padding: '0 8px 12px' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            width: '100%',
            padding: '9px 14px',
            borderRadius: 8,
            background: '#f8fafc',
            color: '#64748b',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          ← 前台首页
        </button>
      </div>
    </aside>
  );
}

function PasswordModal({ show, onClose, toast }) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changing, setChanging] = useState(false);

  if (!show) return null;

  const handleChange = async () => {
    if (!oldPwd || !newPwd) return toast.error('请填写所有字段');
    if (newPwd.length < 6) return toast.error('新密码至少6个字符');
    if (newPwd !== confirmPwd) return toast.error('两次新密码输入不一致');
    setChanging(true);
    try {
      await api.put('/auth/password', { oldPassword: oldPwd, newPassword: newPwd });
      toast.success('密码修改成功，请妥善保管新密码');
      onClose();
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setChanging(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: 400, padding: 28 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 18 }}>🔑 修改密码</h3>
        
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: '#64748b', display: 'block', marginBottom: 6 }}>旧密码</label>
          <input type="password" className="input" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
            placeholder="输入当前密码" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: '#64748b', display: 'block', marginBottom: 6 }}>新密码</label>
          <input type="password" className="input" value={newPwd} onChange={e => setNewPwd(e.target.value)}
            placeholder="至少6个字符" style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: '#64748b', display: 'block', marginBottom: 6 }}>确认新密码</label>
          <input type="password" className="input" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
            placeholder="再次输入新密码" style={{ width: '100%' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleChange} disabled={changing}>
            {changing ? '修改中...' : '确认修改'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 16, marginBottom: 0 }}>
          ⚠️ 修改密码后，其他设备的登录会话将失效
        </p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  
  return (
    <ToastProvider>
      <PasswordModalWrapper show={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <AdminSidebar
          user={user}
          logout={logout}
          navigate={navigate}
          location={location}
          onPasswordClick={() => setShowPasswordModal(true)}
        />
        
        {/* Main content */}
        <main style={{ flex: 1, overflow: 'auto', background: '#f8fafc' }}>
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}

// Wrapper to get toast context inside modal
function PasswordModalWrapper({ show, onClose }) {
  const toast = useToast();
  return <PasswordModal show={show} onClose={onClose} toast={toast} />;
}
