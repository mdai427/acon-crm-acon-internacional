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
import OperationsPage from './pages/OperationsPage';
import UsersPage from './pages/UsersPage';
import QuoterPage from './pages/QuoterPage';
import FollowUpsPage from './pages/FollowUpsPage';
import {
  LayoutDashboard, Users, Kanban, MessageSquare,
  BarChart3, Settings, Plug, Package, UserPlus,
  Calculator, Zap, LogOut, Bell
} from 'lucide-react';

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',      Icon: LayoutDashboard, section: 'main' },
  { id: 'leads',        label: 'Leads',           Icon: Users,           section: 'main' },
  { id: 'pipeline',     label: 'Pipeline',        Icon: Kanban,          section: 'main' },
  { id: 'operations',  label: 'Operaciones',     Icon: Package,         section: 'main' },
  { id: 'quoter',      label: 'Cotizador',       Icon: Calculator,      section: 'main' },
  { id: 'whatsapp',    label: 'WhatsApp',        Icon: MessageSquare,   section: 'main' },
  { id: 'reports',     label: 'Reportes',        Icon: BarChart3,       section: 'analytics' },
  { id: 'followups',   label: 'Automatizaciones', Icon: Zap,            section: 'analytics' },
  { id: 'users',       label: 'Usuarios',        Icon: UserPlus,        section: 'config' },
  { id: 'config',      label: 'Configuración',   Icon: Settings,        section: 'config' },
  { id: 'integrations',label: 'Estado APIs',     Icon: Plug,            section: 'config' },
];

const SECTIONS = { main: 'Principal', analytics: 'Análisis', config: 'Configuración' };

function CRMApp() {
  const { user, logout } = useAuth();
  const { toasts, setToasts, show: toast } = useToast();
  const [page, setPage] = useState('dashboard');
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const handleSelectLead = (id) => { setSelectedLeadId(id); setPage('lead_detail'); };
  const handleBackFromLead = () => { setSelectedLeadId(null); setPage('leads'); };
  const navigate = (p) => { setSelectedLeadId(null); setPage(p); };

  const navBySections = NAV.reduce((acc, n) => {
    acc[n.section] = acc[n.section] || [];
    acc[n.section].push(n);
    return acc;
  }, {});

  return (
    <>
      <div className="app">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo">
            <span className="logo-accent">ACON</span>
            <span style={{ color: '#fff', fontWeight: 400 }}>Internacional</span>
            <span>· Worldwide Logística</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 12 }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <button className="top-btn" style={{ gap: 6 }}>
            <Bell size={13} />
            Notificaciones
          </button>
          <div className="avatar" title={user?.name} onClick={logout}>
            {user?.name?.slice(0, 2).toUpperCase() || 'AC'}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="sidebar">
          {Object.entries(navBySections).map(([section, items]) => (
            <div key={section} className="nav-section">
              <div className="nav-label">{SECTIONS[section]}</div>
              {items.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${(page === id || (page === 'lead_detail' && id === 'leads')) ? 'active' : ''}`}
                  onClick={() => navigate(id)}
                >
                  <span className="nav-icon"><Icon size={16} strokeWidth={1.75} /></span>
                  {label}
                </button>
              ))}
            </div>
          ))}

          <div className="sidebar-user">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
                {user?.name?.slice(0, 2).toUpperCase() || 'AC'}
              </div>
              <div>
                <div className="sidebar-user-name">{user?.name}</div>
                <div className="sidebar-user-role">{user?.role}</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={logout}>
              <LogOut size={13} /> Cerrar sesión
            </button>
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          {page === 'dashboard'   && <Dashboard user={user} onNavigate={navigate} />}
          {page === 'leads'       && <LeadsPage toast={toast} onSelect={handleSelectLead} />}
          {page === 'lead_detail' && selectedLeadId && <LeadDetail leadId={selectedLeadId} toast={toast} onBack={handleBackFromLead} />}
          {page === 'pipeline'    && <PipelinePage toast={toast} onSelect={handleSelectLead} />}
          {page === 'operations'  && <OperationsPage toast={toast} />}
          {page === 'whatsapp'    && <WhatsAppPage toast={toast} />}
          {page === 'reports'     && <ReportsPage toast={toast} />}
          {page === 'config'      && <ConfigPage toast={toast} />}
          {page === 'quoter'      && <QuoterPage toast={toast} />}
          {page === 'followups'   && <FollowUpsPage toast={toast} />}
          {page === 'users'       && <UsersPage toast={toast} />}
          {page === 'integrations'&& <IntegrationsPage toast={toast} />}
        </div>
      </div>

      <Toast toasts={toasts} setToasts={setToasts} />
    </>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="loading" style={{ height: '100vh' }}>
      <div className="spinner" /> Cargando ACON CRM...
    </div>
  );
  return user ? <CRMApp /> : <LoginPage />;
}
