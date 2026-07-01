import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import CommissionsPage from './pages/CommissionsPage';
import CopilotDrawer from './components/CopilotDrawer';
import { useIdleLogout } from './hooks/useIdleLogout';
import { globalSearch, getNotifications } from './services/api';
import {
  LayoutDashboard, Users, Kanban, MessageSquare,
  BarChart3, Settings, Plug, Package, UserPlus,
  Calculator, Zap, LogOut, Bell, FileText, Upload,
  Megaphone, HeartHandshake, Menu, X, ChevronRight, Sparkles, DollarSign,
  Search, AlertTriangle, Clock, Building2
} from 'lucide-react';

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',        Icon: LayoutDashboard, section: 'ventas',    mobile: true,  mobileOrder: 0 },
  { id: 'leads',        label: 'Leads',             Icon: Users,           section: 'ventas',    mobile: true,  mobileOrder: 1 },
  { id: 'pipeline',     label: 'Pipeline',          Icon: Kanban,          section: 'ventas',    mobile: true,  mobileOrder: 2 },
  { id: 'operations',   label: 'Operaciones',       Icon: Package,         section: 'ventas',    mobile: false },
  { id: 'commissions',  label: 'Comisiones',        Icon: DollarSign,      section: 'ventas',    mobile: false },
  { id: 'quoter',       label: 'Cotizador',         Icon: Calculator,      section: 'ventas',    mobile: false },
  { id: 'whatsapp',     label: 'Conversaciones',    Icon: MessageSquare,   section: 'ventas',    mobile: true,  mobileOrder: 3 },
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

// ── Global Search ───────────────────────────────────────────────────────────────
function GlobalSearch({ onSelectLead }) {
  const [q, setQ]           = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);

  const search = useCallback(async (val) => {
    if (val.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await globalSearch(val);
      setResults(res.data.data);
    } catch { setResults(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q), 300);
    return () => clearTimeout(timer.current);
  }, [q, search]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasResults = results && (results.leads?.length || results.operations?.length || results.quotes?.length);

  return (
    <div className="global-search" ref={ref}>
      <div className="gs-input-wrap">
        <Search size={13} className="gs-icon" />
        <input
          className="gs-input"
          placeholder="Buscar leads, operaciones..."
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {q && <button className="gs-clear" onClick={() => { setQ(''); setResults(null); }}><X size={11} /></button>}
      </div>
      {open && q.length >= 2 && (
        <div className="gs-dropdown">
          {loading && <div className="gs-loading">Buscando...</div>}
          {!loading && !hasResults && <div className="gs-empty">Sin resultados para "{q}"</div>}
          {!loading && results?.leads?.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label"><Users size={11} /> Leads</div>
              {results.leads.map(l => (
                <button key={l._id} className="gs-item" onClick={() => { onSelectLead(l._id); setOpen(false); setQ(''); }}>
                  <Building2 size={13} style={{ color: '#6366f1', flexShrink: 0 }} />
                  <span className="gs-item-main">{l.company}</span>
                  <span className="gs-item-sub">{l.contact}</span>
                </button>
              ))}
            </div>
          )}
          {!loading && results?.operations?.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label"><Package size={11} /> Operaciones</div>
              {results.operations.map(o => (
                <div key={o._id} className="gs-item gs-item-static">
                  <Package size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <span className="gs-item-main">{o.bookingNumber || o.clientName}</span>
                  <span className="gs-item-sub">{o.status}</span>
                </div>
              ))}
            </div>
          )}
          {!loading && results?.quotes?.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label"><FileText size={11} /> Cotizaciones</div>
              {results.quotes.map(q2 => (
                <div key={q2._id} className="gs-item gs-item-static">
                  <FileText size={13} style={{ color: '#f97316', flexShrink: 0 }} />
                  <span className="gs-item-main">{q2.folio} · {q2.clientName}</span>
                  <span className="gs-item-sub">{q2.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Notification Center ─────────────────────────────────────────────────────────
function NotificationCenter() {
  const [open, setOpen]     = useState(false);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifications();
      setData(res.data.data);
    } catch { setData(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const total = data?.total || 0;

  return (
    <div className="notif-center" ref={ref}>
      <button className="top-btn top-btn-notif notif-trigger" onClick={() => { setOpen(o => !o); if (!open) load(); }}>
        <Bell size={13} />
        <span className="top-btn-label">Notif.</span>
        {total > 0 && <span className="notif-badge">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-hd">
            <span className="notif-hd-title">Notificaciones</span>
            {total > 0 && <span className="notif-hd-count">{total} nuevas</span>}
          </div>
          {loading && <div className="notif-loading">Cargando...</div>}
          {!loading && total === 0 && (
            <div className="notif-empty">
              <Bell size={24} style={{ opacity: 0.3 }} />
              <div>Todo al día</div>
            </div>
          )}
          {!loading && data?.overdueFollowUps?.length > 0 && (
            <div className="notif-group">
              <div className="notif-group-label"><Clock size={11} /> Seguimientos vencidos</div>
              {data.overdueFollowUps.slice(0, 5).map(l => (
                <div key={l._id} className="notif-item notif-red">
                  <AlertTriangle size={12} />
                  <div>
                    <div className="notif-item-title">{l.company}</div>
                    <div className="notif-item-sub">Seguimiento vencido</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && data?.noContactLeads?.length > 0 && (
            <div className="notif-group">
              <div className="notif-group-label"><Users size={11} /> Sin contacto 7+ días</div>
              {data.noContactLeads.slice(0, 5).map(l => (
                <div key={l._id} className="notif-item notif-yellow">
                  <Clock size={12} />
                  <div>
                    <div className="notif-item-title">{l.company}</div>
                    <div className="notif-item-sub">{l.contact}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && data?.overdueQuotes?.length > 0 && (
            <div className="notif-group">
              <div className="notif-group-label"><FileText size={11} /> Cotizaciones vencidas</div>
              {data.overdueQuotes.slice(0, 3).map(q => (
                <div key={q._id} className="notif-item notif-orange">
                  <FileText size={12} />
                  <div>
                    <div className="notif-item-title">{q.folio} · {q.clientName}</div>
                    <div className="notif-item-sub">Cotización vencida</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

          {/* Global Search */}
          <GlobalSearch onSelectLead={handleSelectLead} />

          <div className="topbar-date">
            {new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>

          {/* Notification Center */}
          <NotificationCenter />

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
          {page === 'commissions'  && <CommissionsPage toast={toast} />}
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
