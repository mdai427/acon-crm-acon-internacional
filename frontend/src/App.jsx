import React, { useState } from 'react';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toast, useToast } from './components/Toast';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import LeadsPage from './pages/LeadsPage';
import LeadDetail from './pages/LeadDetail';
import PipelinePage from './pages/PipelinePage';
import WhatsAppPage from './pages/WhatsAppPage';
import ReportsPage from './pages/ReportsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import ConfigPage from './pages/ConfigPage';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', section: 'main' },
  { id: 'leads', label: 'Leads', icon: '👥', section: 'main' },
  { id: 'pipeline', label: 'Pipeline', icon: '⚡', section: 'main' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', section: 'main' },
  { id: 'reports', label: 'Reportes', icon: '📈', section: 'analytics' },
  { id: 'config', label: 'Configuración', icon: '⚙️', section: 'config' },
  { id: 'integrations', label: 'Estado APIs', icon: '🔌', section: 'config' },
];

function CRMApp() {
  const { user, logout } = useAuth();
  const { toasts, setToasts, show: toast } = useToast();
  const [page, setPage] = useState('dashboard');
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const handleSelectLead = (id) => {
    setSelectedLeadId(id);
    setPage('lead_detail');
  };

  const handleBackFromLead = () => {
    setSelectedLeadId(null);
    setPage('leads');
  };

  const navigate = (p) => {
    setSelectedLeadId(null);
    setPage(p);
  };

  const sections = { main: 'Principal', analytics: 'Análisis', config: 'Configuración' };
  const navBySections = NAV.reduce((acc, n) => {
    acc[n.section] = acc[n.section] || [];
    acc[n.section].push(n);
    return acc;
  }, {});

  const isWA = page === 'whatsapp';

  return (
    <>
      <div className="app">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo">ACON CRM <span>Worldwide Logística</span></div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>{new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })}</div>
          <button className="top-btn" onClick={() => toast('Backend activo en :5001', 'info')}>🟢 Live</button>
          <div className="avatar" title={user?.name} onClick={logout}>
            {user?.name?.slice(0,2).toUpperCase() || 'AC'}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="sidebar">
          {Object.entries(navBySections).map(([section, items]) => (
            <div key={section} className="nav-section">
              <div className="nav-label">{sections[section]}</div>
              {items.map(n => (
                <button key={n.id} className={`nav-item ${(page === n.id || (page === 'lead_detail' && n.id === 'leads')) ? 'active' : ''}`}
                  onClick={() => navigate(n.id)}>
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
          ))}

          {/* Info usuario */}
          <div style={{ marginTop: 'auto', padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--text2)' }}>{user?.name}</div>
            <div style={{ color: 'var(--text3)' }}>{user?.role}</div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          {page === 'dashboard' && <Dashboard user={user} onNavigate={navigate} />}
          {page === 'leads' && <LeadsPage toast={toast} onSelect={handleSelectLead} />}
          {page === 'lead_detail' && selectedLeadId && <LeadDetail leadId={selectedLeadId} toast={toast} onBack={handleBackFromLead} />}
          {page === 'pipeline' && <PipelinePage toast={toast} onSelect={handleSelectLead} />}
          {page === 'whatsapp' && <WhatsAppPage toast={toast} />}
          {page === 'reports' && <ReportsPage toast={toast} />}
          {page === 'config' && <ConfigPage toast={toast} />}
          {page === 'integrations' && <IntegrationsPage toast={toast} />}
        </div>
      </div>

      <Toast toasts={toasts} setToasts={setToasts} />
    </>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading" style={{ height: '100vh' }}>
        <div className="spinner" /> Cargando ACON CRM...
      </div>
    );
  }

  return user ? <CRMApp /> : <LoginPage />;
}

// Wrapper con AuthProvider en index.js
