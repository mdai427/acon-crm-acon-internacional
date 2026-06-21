import React, { useState, useEffect, useRef } from 'react';
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
import TemplatesPage from './pages/TemplatesPage';
import ImportPage from './pages/ImportPage';
import MarketingPage from './pages/MarketingPage';
import PostVentaPage from './pages/PostVentaPage';
import PlaybooksPage from './pages/PlaybooksPage';
import CopilotDrawer from './components/CopilotDrawer';
import { useIdleLogout } from './hooks/useIdleLogout';
import {
  LayoutDashboard, Users, Kanban, MessageSquare,
  BarChart3, Settings, Plug, Package, UserPlus,
  Calculator, Zap, LogOut, Bell, FileText, Upload,
  Megaphone, HeartHandshake, Menu, X, ChevronRight, Sparkles
} from 'lucide-react';

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',        Icon: LayoutDashboard, section: 'ventas',    mobile: true,  mobileOrder: 0 },
  { id: 'leads',        label: 'Leads',             Icon: Users,           section: 'ventas',    mobile: true,  mobileOrder: 1 },
  { id: 'pipeline',     label: 'Pipeline',          Icon: Kanban,          section: 'ventas',    mobile: true,  mobileOrder: 2 },
  { id: 'operations',   label: 'Operaciones',       Icon: Package,         section: 'ventas',    mobile: false },
  { id: 'quoter',       label: 'Cotizador',         Icon: Calculator,      section: 'ventas',    mobile: false },
  { id: 'whatsapp',     label: 'WhatsApp',          Icon: MessageSquare,   section: 'ventas',    mobile: true,  mobileOrder: 3 },
  { id: 'import',       label: 'Importar',          Icon: Upload,          section: 'ventas',    mobile: false },
  { id: 'marketing',    label: 'Campañas',          Icon: Megaphone,       section: 'marketing', mobile: false },
  { id: 'followups',    label: 'Automatiz.',        Icon: Zap,             section: 'marketing', mobile: false },
  { id: 'playbooks',    label: 'Playbooks IA',      Icon: Sparkles,        section: 'marketing', mobile: false },
  { id: 'templates',    label: 'Plantillas',        Icon: FileText,        section: 'marketing', mobile: false },
  { id: 'postventa',    label: 'Post-Venta',        Icon: HeartHandshake,  section: 'marketing', mobile: false },
  { id: 'reports',      label: 'Reportes',          Icon: BarChart3,       section: 'analytics', mobile: true,  mobileOrder: 4 },
  { id: 'users',        label: 'Usuarios',          Icon: UserPlus,        section: 'config',    mobile: false },
  { id: 'config',       label: 'Configuración',     Icon: Settings,        section: 'config',    mobile: false },
  { id: 'integrations', label: 'Integraciones',     Icon: Plug,            section: 'config',    mobile: false },
];

const SECTIONS = { ventas: 'Ventas', marketing: 'Marketing', analytics: 'Análisis', config: 'Configuración' };

// Mobile bottom nav — 5 most important items
const MOBILE_NAV = NAV.filter(n => n.mobile).sort((a, b) => a.mobileOrder - b.mobileOrder);

function CRMApp() {
  const { user, logout } = useAuth();
  const { toasts, setToasts, show: toast } = useToast();
  const [page, setPage] = useState('dashboard');
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef(null);

  const { countdown, stayActive } = useIdleLogout(() => { logout(); }, true);

  React.useEffect(() => {
    setShowIdleWarning(countdown !== null);
  }, [countdown]);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    const handler = (e) => {
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [sidebarOpen]);

  const handleSelectLead = (id) => { setSelectedLeadId(id); setPage('lead_detail'); setSidebarOpen(false); };
  const handleBackFromLead = () => { setSelectedLeadId(null); setPage('leads'); };
  const navigate = (p) => { setSelectedLeadId(null); setPage(p); setSidebarOpen(false); };

  const navBySections = NAV.reduce((acc, n) => {
    acc[n.section] = acc[n.section] || [];
    acc[n.section].push(n);
    return acc;
  }, {});

  const activePage = page === 'lead_detail' ? 'leads' : page;

  return (
    <>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className="app">
        {/* TOPBAR */}
        <div className="topbar">
          {/* Hamburger — mobile only */}
          <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menú">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="logo">
            <span className="logo-accent">ACON</span>
            <span className="logo-full"> Internacional</span>
            <span className="logo-sub">· Worldwide</span>
          </div>

          <div className="topbar-date">
            {new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>

          <button className="top-btn top-btn-notif">
            <Bell size={13} />
            <span className="top-btn-label">Notif.</span>
          </button>

          <div className="avatar" title={user?.name} onClick={logout}>
            {user?.name?.slice(0, 2).toUpperCase() || 'AC'}
          </div>
        </div>

        {/* SIDEBAR */}
        <div ref={sidebarRef} className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          {/* Mobile close */}
          <div className="sidebar-close-row">
            <div className="sidebar-brand">
              <span style={{ color: 'var(--orange-500)', fontWeight: 800 }}>ACON</span>
              <span style={{ color: 'rgba(255,255,255,.7)', fontWeight: 400 }}> CRM</span>
            </div>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {Object.entries(navBySections).map(([section, items]) => (
            <div key={section} className="nav-section">
              <div className="nav-label">{SECTIONS[section]}</div>
              {items.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${activePage === id ? 'active' : ''}`}
                  onClick={() => navigate(id)}
                >
                  <span className="nav-icon"><Icon size={16} strokeWidth={1.75} /></span>
                  <span className="nav-item-label">{label}</span>
                  {activePage === id && <ChevronRight size={12} className="nav-chevron" />}
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
          {page === 'dashboard'    && <Dashboard user={user} onNavigate={navigate} />}
          {page === 'leads'        && <LeadsPage toast={toast} onSelect={handleSelectLead} />}
          {page === 'lead_detail'  && selectedLeadId && <LeadDetail leadId={selectedLeadId} toast={toast} onBack={handleBackFromLead} />}
          {page === 'pipeline'     && <PipelinePage toast={toast} onSelect={handleSelectLead} />}
          {page === 'operations'   && <OperationsPage toast={toast} />}
          {page === 'whatsapp'     && <WhatsAppPage toast={toast} />}
          {page === 'reports'      && <ReportsPage toast={toast} />}
          {page === 'config'       && <ConfigPage toast={toast} />}
          {page === 'quoter'       && <QuoterPage toast={toast} />}
          {page === 'followups'    && <FollowUpsPage toast={toast} />}
          {page === 'users'        && <UsersPage toast={toast} />}
          {page === 'integrations' && <IntegrationsPage toast={toast} />}
          {page === 'templates'    && <TemplatesPage toast={toast} />}
          {page === 'import'       && <ImportPage toast={toast} onNavigate={navigate} />}
          {page === 'marketing'    && <MarketingPage toast={toast} />}
          {page === 'postventa'    && <PostVentaPage toast={toast} />}
          {page === 'playbooks'    && <PlaybooksPage toast={toast} />}
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav className="mobile-nav">
        {MOBILE_NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`mobile-nav-item ${activePage === id ? 'active' : ''}`}
            onClick={() => navigate(id)}
          >
            <Icon size={20} strokeWidth={activePage === id ? 2.5 : 1.75} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Copilot IA */}
      <CopilotDrawer toast={toast} />

      <Toast toasts={toasts} setToasts={setToasts} />

      {/* Idle logout warning */}
      {showIdleWarning && countdown !== null && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
            <div className="modal-header">
              <div className="modal-title">Sesión por expirar</div>
            </div>
            <p style={{ color: 'var(--text2)', fontSize: 14, margin: '12px 0 20px' }}>
              Tu sesión cerrará en <strong>{countdown}</strong> segundo{countdown !== 1 ? 's' : ''} por inactividad.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn" style={{ background: 'var(--orange-500)', color: '#fff' }} onClick={() => { stayActive(); setShowIdleWarning(false); }}>
                Seguir conectado
              </button>
              <button className="btn btn-ghost" onClick={logout}>Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}
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
