import React, { useState } from 'react';
import { Shield, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { id: 'admin',       label: 'Administrador',       color: '#DC2626' },
  { id: 'direccion',   label: 'Dirección',            color: '#7C3AED' },
  { id: 'gerencia',    label: 'Gerencia Comercial',   color: '#2563EB' },
  { id: 'executive',   label: 'Ejecutivo Comercial',  color: '#F2641E' },
  { id: 'operaciones', label: 'Operaciones',           color: '#16A34A' },
  { id: 'marketing',   label: 'Marketing',             color: '#0891B2' },
  { id: 'finanzas',    label: 'Finanzas',              color: '#CA8A04' },
  { id: 'viewer',      label: 'Solo Lectura',          color: '#9AA3AE' },
];

const PERM_GROUPS = [
  {
    label: 'Leads',
    perms: [
      { id: 'leads.view',       label: 'Ver leads' },
      { id: 'leads.view_all',   label: 'Ver todos los leads (sin filtro de ejecutivo)' },
      { id: 'leads.create',     label: 'Crear leads' },
      { id: 'leads.edit',       label: 'Editar leads' },
      { id: 'leads.delete',     label: 'Eliminar leads' },
      { id: 'leads.assign',     label: 'Reasignar leads' },
      { id: 'leads.import',     label: 'Importar leads (Excel)' },
      { id: 'leads.export',     label: 'Exportar leads (CSV)' },
      { id: 'leads.rescore',    label: 'Rescoring masivo IA' },
    ],
  },
  {
    label: 'Cotizador',
    perms: [
      { id: 'quotes.view',    label: 'Ver cotizaciones' },
      { id: 'quotes.create',  label: 'Crear cotizaciones' },
      { id: 'quotes.edit',    label: 'Editar cotizaciones' },
      { id: 'quotes.delete',  label: 'Eliminar cotizaciones' },
      { id: 'quotes.approve', label: 'Aprobar / rechazar cotizaciones' },
      { id: 'quotes.send',    label: 'Marcar cotización como enviada' },
    ],
  },
  {
    label: 'Operaciones',
    perms: [
      { id: 'operations.view',   label: 'Ver operaciones' },
      { id: 'operations.create', label: 'Crear embarques' },
      { id: 'operations.edit',   label: 'Editar embarques' },
      { id: 'operations.delete', label: 'Eliminar embarques' },
    ],
  },
  {
    label: 'Comisiones',
    perms: [
      { id: 'commissions.view',     label: 'Ver comisiones propias' },
      { id: 'commissions.view_all', label: 'Ver comisiones de todos' },
      { id: 'commissions.create',   label: 'Registrar comisiones' },
      { id: 'commissions.edit',     label: 'Editar comisiones' },
      { id: 'commissions.delete',   label: 'Eliminar comisiones' },
      { id: 'commissions.config',   label: 'Configurar reglas de comisiones' },
    ],
  },
  {
    label: 'Marketing',
    perms: [
      { id: 'marketing.view',   label: 'Ver campañas' },
      { id: 'marketing.create', label: 'Crear campañas' },
      { id: 'marketing.launch', label: 'Lanzar campañas' },
      { id: 'marketing.delete', label: 'Eliminar campañas' },
    ],
  },
  {
    label: 'Reportes',
    perms: [
      { id: 'reports.view',   label: 'Ver reportes' },
      { id: 'reports.team',   label: 'Ver reporte de equipo' },
      { id: 'reports.export', label: 'Exportar reportes' },
    ],
  },
  {
    label: 'Usuarios y Config',
    perms: [
      { id: 'users.view',           label: 'Ver usuarios' },
      { id: 'users.create',         label: 'Crear usuarios' },
      { id: 'users.edit',           label: 'Editar usuarios' },
      { id: 'users.delete',         label: 'Desactivar usuarios' },
      { id: 'config.view',          label: 'Ver configuración' },
      { id: 'config.edit',          label: 'Editar configuración' },
      { id: 'integrations.connect', label: 'Conectar integraciones' },
    ],
  },
];

// Matriz de permisos (igual que el backend, para visualización)
const PERMISSIONS = {
  'leads.view':           ['admin','direccion','gerencia','executive','operaciones','marketing','finanzas','viewer'],
  'leads.create':         ['admin','direccion','gerencia','executive','marketing'],
  'leads.edit':           ['admin','direccion','gerencia','executive'],
  'leads.delete':         ['admin','gerencia'],
  'leads.assign':         ['admin','gerencia'],
  'leads.view_all':       ['admin','direccion','gerencia','finanzas'],
  'leads.import':         ['admin','gerencia','marketing'],
  'leads.export':         ['admin','direccion','gerencia','finanzas'],
  'leads.rescore':        ['admin','gerencia'],
  'quotes.view':          ['admin','direccion','gerencia','executive','finanzas','viewer'],
  'quotes.create':        ['admin','gerencia','executive'],
  'quotes.edit':          ['admin','gerencia','executive'],
  'quotes.delete':        ['admin','gerencia'],
  'quotes.approve':       ['admin','direccion','gerencia'],
  'quotes.send':          ['admin','gerencia','executive'],
  'operations.view':      ['admin','direccion','gerencia','executive','operaciones','finanzas','viewer'],
  'operations.create':    ['admin','gerencia','operaciones'],
  'operations.edit':      ['admin','gerencia','operaciones'],
  'operations.delete':    ['admin','gerencia'],
  'commissions.view':     ['admin','direccion','gerencia','executive','finanzas'],
  'commissions.view_all': ['admin','direccion','gerencia','finanzas'],
  'commissions.create':   ['admin','gerencia','finanzas'],
  'commissions.edit':     ['admin','gerencia','finanzas'],
  'commissions.delete':   ['admin'],
  'commissions.config':   ['admin'],
  'marketing.view':       ['admin','direccion','gerencia','marketing','finanzas','viewer'],
  'marketing.create':     ['admin','gerencia','marketing'],
  'marketing.launch':     ['admin','gerencia','marketing'],
  'marketing.delete':     ['admin','gerencia'],
  'reports.view':         ['admin','direccion','gerencia','finanzas','viewer'],
  'reports.team':         ['admin','direccion','gerencia'],
  'reports.export':       ['admin','direccion','gerencia','finanzas'],
  'users.view':           ['admin','direccion','gerencia'],
  'users.create':         ['admin'],
  'users.edit':           ['admin'],
  'users.delete':         ['admin'],
  'config.view':          ['admin'],
  'config.edit':          ['admin'],
  'integrations.connect': ['admin'],
};

export default function PermissionsPage({ toast }) {
  const { user } = useAuth();
  const [activeRole, setActiveRole] = useState(null);

  if (user?.role !== 'admin') {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <Shield size={40} style={{ color: 'var(--gray-400)', marginBottom: 12 }} />
          <div style={{ color: 'var(--gray-500)' }}>Acceso restringido a administradores</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Permisos y Roles</div>
          <div className="page-sub">Matriz de acceso por rol — {ROLES.length} roles · {Object.keys(PERMISSIONS).length} permisos</div>
        </div>
      </div>

      {/* Filtro por rol */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${!activeRole ? 'btn-navy' : 'btn-ghost'}`}
          onClick={() => setActiveRole(null)}
        >
          Todos los roles
        </button>
        {ROLES.map(r => (
          <button
            key={r.id}
            className={`btn btn-sm ${activeRole === r.id ? 'btn-navy' : 'btn-ghost'}`}
            onClick={() => setActiveRole(activeRole === r.id ? null : r.id)}
            style={activeRole === r.id ? { background: r.color, borderColor: r.color } : {}}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Tabla de permisos */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--gray-500)', width: 240, position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 1 }}>
                Permiso
              </th>
              {ROLES.filter(r => !activeRole || r.id === activeRole).map(r => (
                <th key={r.id} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: r.color, minWidth: 90, whiteSpace: 'nowrap' }}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_GROUPS.map((group, gi) => (
              <React.Fragment key={group.label}>
                <tr>
                  <td colSpan={ROLES.filter(r => !activeRole || r.id === activeRole).length + 1}
                    style={{ padding: '10px 16px 4px', fontWeight: 700, fontSize: 11, color: 'var(--gray-500)', letterSpacing: 1, textTransform: 'uppercase', background: 'var(--gray-50)', borderTop: gi > 0 ? '2px solid var(--border)' : 'none' }}>
                    {group.label}
                  </td>
                </tr>
                {group.perms.map(perm => {
                  const allowed = PERMISSIONS[perm.id] || [];
                  return (
                    <tr key={perm.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 16px', color: 'var(--text)', position: 'sticky', left: 0, background: 'var(--white)', zIndex: 1 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gray-400)', marginRight: 8 }}>{perm.id}</span>
                        <span style={{ color: 'var(--text2)' }}>{perm.label}</span>
                      </td>
                      {ROLES.filter(r => !activeRole || r.id === activeRole).map(r => {
                        const hasPerm = allowed.includes(r.id);
                        return (
                          <td key={r.id} style={{ textAlign: 'center', padding: '8px 12px' }}>
                            {hasPerm
                              ? <Check size={14} color="#16A34A" />
                              : <X size={14} color="var(--gray-200)" />
                            }
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-sm" style={{ marginTop: 16, background: 'var(--blue-bg)', borderColor: 'var(--blue)', fontSize: 12, color: 'var(--blue)' }}>
        <strong>Nota:</strong> Los permisos son controlados en el backend mediante la matriz <code>backend/src/config/permissions.js</code>. Para modificar permisos de un rol, edita ese archivo y redeploya el backend.
      </div>
    </div>
  );
}
