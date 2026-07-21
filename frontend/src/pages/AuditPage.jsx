import React, { useState, useEffect, useCallback } from 'react';
import { getAuditLogs, getAuditEntities } from '../services/api';
import { Shield, Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ACTION_COLORS = {
  create:  { bg: '#DCFCE7', text: '#166534', label: 'Crear' },
  update:  { bg: '#DBEAFE', text: '#1E40AF', label: 'Editar' },
  delete:  { bg: '#FEE2E2', text: '#991B1B', label: 'Eliminar' },
  login:   { bg: '#F3F4F6', text: '#374151', label: 'Login' },
  approve: { bg: '#FEF9C3', text: '#92400E', label: 'Aprobar' },
  export:  { bg: '#EDE9FE', text: '#5B21B6', label: 'Exportar' },
};

function AuditRow({ log }) {
  const [open, setOpen] = useState(false);
  const ac = ACTION_COLORS[log.action] || { bg: '#F3F4F6', text: '#374151', label: log.action };
  const hasChanges = log.changes?.length > 0;

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border)', cursor: hasChanges ? 'pointer' : 'default' }}
        onClick={() => hasChanges && setOpen(o => !o)}>
        <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
          {new Date(log.createdAt).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
        </td>
        <td style={{ padding: '9px 14px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: ac.bg, color: ac.text }}>{ac.label}</span>
        </td>
        <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{log.entity}</td>
        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {log.entityLabel || log.entityId || '—'}
        </td>
        <td style={{ padding: '9px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{log.user?.name || log.userName || '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{log.user?.role || log.userRole}</div>
        </td>
        <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{log.ip}</td>
        <td style={{ padding: '9px 14px', width: 32 }}>
          {hasChanges && (open ? <ChevronDown size={14} style={{ color: 'var(--text3)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text3)' }} />)}
        </td>
      </tr>
      {open && hasChanges && (
        <tr style={{ background: 'var(--gray-50)' }}>
          <td colSpan={7} style={{ padding: '10px 24px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>CAMBIOS REGISTRADOS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {log.changes.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', fontSize: 11 }}>{c.field}</div>
                  <div style={{ color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.oldValue === null || c.oldValue === undefined ? <em>vacío</em> : String(c.oldValue)}
                  </div>
                  <div style={{ color: '#16A34A', background: '#F0FDF4', padding: '2px 8px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.newValue === null || c.newValue === undefined ? <em>vacío</em> : String(c.newValue)}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditPage({ toast }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState([]);

  const [filters, setFilters] = useState({
    entity: '', action: '', search: '', from: '', to: '', page: 1,
  });

  const load = useCallback(async (f = filters) => {
    setLoading(true);
    try {
      const params = { ...f, limit: 50 };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const r = await getAuditLogs(params);
      setLogs(r.data.data || []);
      setTotal(r.data.total || 0);
      setPages(r.data.pages || 1);
    } catch (e) {
      toast(e.response?.data?.message || 'Error al cargar auditoría', 'error');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    load();
    getAuditEntities().then(r => setEntities(r.data.data || [])).catch(() => {});
  }, []);

  if (!['admin', 'direccion', 'gerencia'].includes(user?.role)) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Acceso restringido</div>;
  }

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));

  const handleSearch = () => load(filters);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Auditoría del Sistema</div>
          <div className="page-sub">{total.toLocaleString()} eventos registrados — quién hizo qué, cuándo y desde dónde</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load()}><RefreshCw size={13} /></button>
      </div>

      {/* Filters */}
      <div className="card card-sm" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Entidad</label>
          <select className="form-select" style={{ minWidth: 120 }} value={filters.entity} onChange={e => setFilter('entity', e.target.value)}>
            <option value="">Todas</option>
            {entities.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Acción</label>
          <select className="form-select" style={{ minWidth: 110 }} value={filters.action} onChange={e => setFilter('action', e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ACTION_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Desde</label>
          <input type="date" className="form-input" style={{ width: 140 }} value={filters.from} onChange={e => setFilter('from', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Hasta</label>
          <input type="date" className="form-input" style={{ width: 140 }} value={filters.to} onChange={e => setFilter('to', e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Buscar</label>
          <input className="form-input" placeholder="Usuario, entidad, descripción..." value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSearch}><Search size={13} /> Filtrar</button>
        {(filters.entity || filters.action || filters.search || filters.from || filters.to) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { const f = { entity:'',action:'',search:'',from:'',to:'',page:1 }; setFilters(f); load(f); }}>Limpiar</button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading"><div className="spinner" />Cargando...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            <Shield size={36} style={{ color: 'var(--gray-300)', marginBottom: 12 }} />
            <div>Sin eventos de auditoría para los filtros seleccionados</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--border)' }}>
                {['Fecha', 'Acción', 'Entidad', 'Registro', 'Usuario', 'IP', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => <AuditRow key={log._id} log={log} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" disabled={filters.page <= 1}
            onClick={() => { const f = { ...filters, page: filters.page - 1 }; setFilters(f); load(f); }}>← Anterior</button>
          <span style={{ fontSize: 13, color: 'var(--text3)', alignSelf: 'center' }}>Pág. {filters.page} de {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={filters.page >= pages}
            onClick={() => { const f = { ...filters, page: filters.page + 1 }; setFilters(f); load(f); }}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}
