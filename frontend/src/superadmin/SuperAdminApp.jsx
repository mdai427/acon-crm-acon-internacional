import React, { useState } from 'react';
import { Crown, LogOut, BarChart3, Percent, CalendarRange } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Toast, useToast } from '../components/Toast';
import OverviewTab from './OverviewTab';
import PricingTab from './PricingTab';
import PeriodsTab from './PeriodsTab';
import './superadmin.css';

// Panel del dueño de la plataforma. Vive fuera del CRM a propósito: mismo login
// y misma base de datos, pero otra aplicación — aquí se ve el costo real de la
// IA, el margen de reventa y lo que se le factura al CRM.

const TABS = [
  { id: 'overview', label: 'Métricas',  Icon: BarChart3 },
  { id: 'pricing',  label: 'Tarifas y margen', Icon: Percent },
  { id: 'periods',  label: 'Periodos',  Icon: CalendarRange },
];

export default function SuperAdminApp() {
  const { user, logout } = useAuth();
  const { toasts, setToasts, show: toast } = useToast();
  const [tab, setTab] = useState('overview');

  return (
    <div className="sa-app">
      <header className="sa-topbar">
        <div className="sa-brand">
          <Crown size={18} />
          <span>Panel de plataforma</span>
        </div>

        <nav className="sa-tabs">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`sa-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        <div className="sa-user">
          <span>{user?.email}</span>
          <button className="sa-logout" onClick={logout} title="Cerrar sesión">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className="sa-main">
        {tab === 'overview' && <OverviewTab toast={toast} />}
        {tab === 'pricing'  && <PricingTab toast={toast} />}
        {tab === 'periods'  && <PeriodsTab toast={toast} />}
      </main>

      <Toast toasts={toasts} setToasts={setToasts} />
    </div>
  );
}
