import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './contexts/AuthContext';
import FrontendLayout from './pages/frontend/FrontendLayout';
import AdminLayout from './pages/admin/AdminLayout';
import AgentList from './pages/frontend/AgentList';
import ChatPage from './pages/frontend/ChatPage';
import LoginPage from './pages/LoginPage';
import AdminAgents from './pages/admin/AdminAgents';
import AdminAgentConfig from './pages/admin/AdminAgentConfig';
import AdminKnowledge from './pages/admin/AdminKnowledge';
import AdminKnowledgeDetail from './pages/admin/AdminKnowledgeDetail';
import AdminPlugins from './pages/admin/AdminPlugins';
import AdminModels from './pages/admin/AdminModels';
import AdminWorkflow from './pages/admin/AdminWorkflow';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAgentDetail from './pages/admin/AdminAgentDetail';
import AdminAgentEvaluate from './pages/admin/AdminAgentEvaluate';
import AdminAgentMetrics from './pages/admin/AdminAgentMetrics';
import AdminAuthorizedAgents from './pages/admin/AdminAuthorizedAgents';
import AdminBusiness from './pages/admin/AdminBusiness';
import './styles/global.css';

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          {/* Login */}
          <Route path="/login" element={<LoginPage />} />
          
          {/* Frontend routes */}
          <Route path="/" element={<FrontendLayout />}>
            <Route index element={<AgentList />} />
            <Route path="chat/:agentId" element={<ChatPage />} />
          </Route>
          
          {/* Admin routes (protected) */}
          <Route path="/admin" element={
            <RequireAuth><AdminLayout /></RequireAuth>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="agents" element={<AdminAgents />} />
            <Route path="agents/:agentId/config" element={<AdminAgentConfig />} />
            <Route path="agents/:agentId/detail" element={<AdminAgentDetail />} />
            <Route path="agents/:agentId/evaluate" element={<AdminAgentEvaluate />} />
            <Route path="agents/:agentId/metrics" element={<AdminAgentMetrics />} />
            <Route path="authorized-agents" element={<AdminAuthorizedAgents />} />
            <Route path="knowledge" element={<AdminKnowledge />} />
            <Route path="knowledge/:kbId" element={<AdminKnowledgeDetail />} />
            <Route path="plugins" element={<AdminPlugins />} />
            <Route path="models" element={<AdminModels />} />
            <Route path="business" element={<AdminBusiness />} />
            <Route path="workflow/:agentId?" element={<AdminWorkflow />} />
            <Route path="dashboard" element={<AdminDashboard />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
