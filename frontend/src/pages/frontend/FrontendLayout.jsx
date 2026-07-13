import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast';

export default function FrontendLayout() {
  const navigate = useNavigate();

  return (
    <ToastProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Top nav (intro 风格：白底 + 蓝色强调) */}
        <header className="topnav">
          <Link to="/" className="topnav-brand">
            <span style={{ fontSize: 22 }}>🌾</span> 麦语工坊
          </Link>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => navigate('/admin')}
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
          >
            ⚙️ 管理后台
          </button>
          <button
            onClick={() => navigate('/admin')}
            className="btn btn-accent btn-sm"
            style={{ fontSize: 13 }}
          >
            ＋ 新建智能体
          </button>
          <div className="topnav-avatar">👤</div>
        </header>

        {/* Main content */}
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
