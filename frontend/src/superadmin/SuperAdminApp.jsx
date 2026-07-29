import React, { useState } from 'react';
import { Crown, LogOut, BarChart3, Percent, CalendarRange, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Toast, useToast } from '../components/Toast';
import OverviewTab from './OverviewTab';
import PricingTab from './PricingTab';
import PeriodsTab from './PeriodsTab';
import './superadmin.css';

// Panel del dueño de la plataforma. Vive fuera del CRM a propósito: mismo login
// y misma base de datos, pero otra aplicación — aquí se ve el costo real de la
// IA, el margen de reventa y lo que se le factura al CRM.

const NAV = [
  {
    section: 'Consumo',
    items: [
      { id: 'overview', label: 'Métricas', Icon: BarChart3, hint: 'Costo, facturado y ganancia' },
    ],
  },
  {
    section: 'Facturación',
    items: [
      { id: 'pricing', label: 'Tarifas y margen', Icon: Percent, hint: 'Precio por modelo y reventa' },
      { id: 'periods', label: 'Periodos', Icon: CalendarRange, hint: 'Cierre mensual' },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap(g => g.items);

export default function SuperAdminApp() {
  const { user, logout } = useAuth();
  const { toasts, setToasts, show: toast } = useToast();
  const [page, setPage] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const current = ALL_ITEMS.find(i => i.id === page);

  const go = (id) => { setPage(id); setSidebarOpen(false); };

  return (
    <div className="sa-app">
      {/* Barra superior: solo marca, título de la pantalla y sesión */}
      <header className="sa-topbar">
        <button className="sa-burger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menú">
          {sidebarOpen ? <X size={17} /> : <Menu size={17} />}
        </button>
        <div className="sa-brand">
          <Crown size={17} />
          <span>Panel de plataforma</span>
        </div>
        <div className="sa-topbar-title">{current?.label}</div>
        <div className="sa-user">
          <span className="sa-user-mail">{user?.email}</span>
          <button className="sa-logout" onClick={logout} title="Cerrar sesión">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Sidebar de navegación */}
      <aside className={`sa-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        {NAV.map(group => (
          <div key={group.section} className="sa-nav-group">
            <div className="sa-nav-label">{group.section}</div>
            {group.items.map(({ id, label, Icon, hint }) => (
              <button
                key={id}
                className={`sa-nav-item${page === id ? ' is-active' : ''}`}
                onClick={() => go(id)}
              >
                <Icon size={16} className="sa-nav-icon" />
                <span className="sa-nav-text">
                  {label}
                  <span className="sa-nav-hint">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        ))}

        <div className="sa-sidebar-foot">
          <div className="sa-sidebar-user">{user?.name || 'Super admin'}</div>
          <div className="sa-sidebar-role">Dueño de la plataforma</div>
        </div>
      </aside>

      {/* Fondo para cerrar el menú en móvil */}
      {sidebarOpen && <div className="sa-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="sa-main">
        {page === 'overview' && <OverviewTab toast={toast} />}
        {page === 'pricing'  && <PricingTab toast={toast} />}
        {page === 'periods'  && <PeriodsTab toast={toast} />}
      </main>

      <Toast toasts={toasts} setToasts={setToasts} />
    </div>
  );
}
