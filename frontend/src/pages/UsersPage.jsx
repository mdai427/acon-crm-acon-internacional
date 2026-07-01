import React, { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../services/api';
import { UserPlus, Shield, Eye, User, MoreVertical, KeyRound, Trash2, Edit3, X, Check, DollarSign, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCommissionRules, saveCommissionRules, getCommissionsConfig } from '../services/api';

const ROLES = [
  { id: 'admin',     label: 'Administrador', Icon: Shield, color: '#F2641E', desc: 'Acceso total al sistema, usuarios y configuración' },
  { id: 'executive', label: 'Ejecutivo',     Icon: User,   color: '#2563EB', desc: 'Gestiona leads y operaciones asignados' },
  { id: 'viewer',    label: 'Visualizador',  Icon: Eye,    color: '#16A34A', desc: 'Solo lectura del sistema' },
];

const ROLE_BADGE = {
  admin:     { label: 'Admin',      bg: '#FEF0E8', color: '#F2641E' },
  executive: { label: 'Ejecutivo',  bg: '#DBEAFE', color: '#2563EB' },
  viewer:    { label: 'Viewer',     bg: '#DCFCE7', color: '#16A34A' },
};

const SERVICE_LIST = [
  { key: 'maritimo_import',    label: 'Marítimo Import.' },
  { key: 'maritimo_export',    label: 'Marítimo Export.' },
  { key: 'aereo_import',       label: 'Aéreo Import.' },
  { key: 'aereo_export',       label: 'Aéreo Export.' },
  { key: 'terrestre_usa',      label: 'Terrestre USA' },
  { key: 'terrestre_nacional', label: 'Terrestre Nal.' },
  { key: 'despacho_aduanal',   label: 'Desp. Aduanal' },
  { key: 'almacenaje',         label: 'Almacenaje' },
  { key: 'seguro_carga',       label: 'Seguro de Carga' },
  { key: 'otro',               label: 'Otro' },
];

const LEAD_TYPES = [
  { key: 'campaign', label: 'Campaña',       color: '#7c3aed', desc: 'Leads de publicidad pagada' },
  { key: 'direct',   label: 'Directo',       color: '#0369a1', desc: 'Prospectado por el ejecutivo' },
  { key: 'referral', label: 'Recomendación', color: '#15803d', desc: 'Referido por cliente' },
];

const EMPTY_RULES = {
  campaign: Object.fromEntries(SERVICE_LIST.map(s => [s.key, ''])),
  direct:   Object.fromEntries(SERVICE_LIST.map(s => [s.key, ''])),
  referral: Object.fromEntries(SERVICE_LIST.map(s => [s.key, ''])),
};

const EMPTY_FORM = { name: '', email: '', password: '', role: 'executive', phone: '' };

function RoleBadge({ role }) {
  const r = ROLE_BADGE[role] || ROLE_BADGE.executive;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: r.bg, color: r.color }}>
      {r.label}
    </span>
  );
}

function Avatar({ name, size = 36 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--navy-900)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.33, fontWeight: 700, flexShrink: 0, letterSpacing: '.5px'
    }}>
      {initials}
    </div>
  );
}

export default function UsersPage({ toast }) {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState({});
  // commission rules para nuevo usuario
  const [newRules, setNewRules] = useState(EMPTY_RULES);
  const [newRulesTab, setNewRulesTab] = useState('campaign');
  // commission rules para editar usuario
  const [editRules, setEditRules] = useState(EMPTY_RULES);
  const [editRulesTab, setEditRulesTab] = useState('campaign');

  const load = () => {
    setLoading(true);
    getUsers()
      .then(r => setUsers(r.data.data || []))
      .catch(() => toast('Error al cargar usuarios', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getCommissionsConfig().then(r => setDefaults(r.data.data || {})).catch(() => {});
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const close = () => setMenuOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const parseRules = (rules) => {
    const out = { campaign: {}, direct: {}, referral: {} };
    for (const lt of ['campaign', 'direct', 'referral']) {
      for (const s of SERVICE_LIST) {
        const v = rules[lt]?.[s.key];
        out[lt][s.key] = v !== '' && v != null ? parseFloat(v) : null;
      }
    }
    return out;
  };

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return toast('Nombre, email y contraseña son requeridos', 'error');
    if (form.password.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error');
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.role === 'executive') payload.commissionRules = parseRules(newRules);
      const res = await createUser(payload);
      toast(`Usuario ${form.name} creado`, 'success');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setNewRules(EMPTY_RULES);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al crear usuario', 'error');
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (editForm.role === 'executive') payload.commissionRules = parseRules(editRules);
      await updateUser(editUser._id, payload);
      toast('Usuario actualizado', 'success');
      setEditUser(null);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al actualizar', 'error');
    } finally { setSaving(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) return toast('Mínimo 6 caracteres', 'error');
    setSaving(true);
    try {
      await resetUserPassword(resetUser._id, newPassword);
      toast(`Contraseña de ${resetUser.name} actualizada`, 'success');
      setResetUser(null);
      setNewPassword('');
    } catch (e) {
      toast(e.response?.data?.message || 'Error al resetear contraseña', 'error');
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (u) => {
    if (!window.confirm(`¿Desactivar a ${u.name}? No podrá iniciar sesión.`)) return;
    try {
      await deleteUser(u._id);
      toast(`${u.name} desactivado`, 'success');
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al desactivar', 'error');
    }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ name: u.name, role: u.role, phone: u.phone || '' });
    setMenuOpen(null);
    // Cargar reglas existentes
    const existing = u.commissionRules || {};
    const loaded = { campaign: {}, direct: {}, referral: {} };
    for (const lt of ['campaign', 'direct', 'referral']) {
      for (const s of SERVICE_LIST) {
        const v = existing?.[lt]?.[s.key];
        loaded[lt][s.key] = v != null ? String(v) : '';
      }
    }
    setEditRules(loaded);
    setEditRulesTab('campaign');
  };

  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const ef = (key, val) => setEditForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Usuarios</div>
          <div className="page-sub">{users.length} {users.length === 1 ? 'usuario' : 'usuarios'} en el sistema</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserPlus size={15} /> Nuevo Usuario
          </button>
        )}
      </div>

      {/* Roles info */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {ROLES.map(({ id, label, Icon, color, desc }) => (
            <div key={id} className="card card-sm" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} style={{ color }} strokeWidth={1.75} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy-900)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading"><div className="spinner" />Cargando usuarios...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Teléfono</th>
                  <th>Último acceso</th>
                  <th>Estado</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={u.name} size={34} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {u.name}
                            {u._id === me?._id && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--orange-500)', fontWeight: 600 }}>Tú</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{u.email}</td>
                    <td><RoleBadge role={u.role} /></td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{u.phone || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Nunca'}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
                        borderRadius: 20, fontSize: 11, fontWeight: 500,
                        background: u.isActive ? 'var(--green-bg)' : 'var(--red-bg)',
                        color: u.isActive ? 'var(--green)' : 'var(--red)'
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                        <button
                          className="btn btn-ghost btn-icon"
                          onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === u._id ? null : u._id); }}
                        >
                          <MoreVertical size={15} />
                        </button>
                        {menuOpen === u._id && (
                          <div style={{
                            position: 'absolute', right: 8, top: '100%', zIndex: 100,
                            background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10,
                            boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 180, overflow: 'hidden'
                          }}>
                            <button className="ctx-item" onClick={() => openEdit(u)} style={ctxStyle}>
                              <Edit3 size={13} /> Editar
                            </button>
                            <button className="ctx-item" onClick={() => { setResetUser(u); setMenuOpen(null); }} style={ctxStyle}>
                              <KeyRound size={13} /> Resetear contraseña
                            </button>
                            {u._id !== me?._id && (
                              <button onClick={() => { handleDeactivate(u); setMenuOpen(null); }}
                                style={{ ...ctxStyle, color: 'var(--red)' }}>
                                <Trash2 size={13} /> Desactivar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Crear usuario ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: form.role === 'executive' ? 620 : 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={18} style={{ color: 'var(--orange-500)' }} /> Nuevo Usuario
              </div>
              <button className="modal-close" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="form-input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ej. María García" />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+521..." />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="usuario@aconinternacional.com" />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña temporal *</label>
              <input className="form-input" type="password" value={form.password} onChange={e => f('password', e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>

            <div className="form-group">
              <label className="form-label">Rol *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {ROLES.map(({ id, label, Icon, color, desc }) => (
                  <button key={id} type="button"
                    onClick={() => f('role', id)}
                    style={{
                      padding: '10px 8px', borderRadius: 8, border: `2px solid ${form.role === id ? color : 'var(--gray-200)'}`,
                      background: form.role === id ? `${color}10` : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .15s'
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Icon size={13} style={{ color }} strokeWidth={1.75} />
                      <span style={{ fontWeight: 600, fontSize: 12, color: form.role === id ? color : 'var(--gray-900)' }}>{label}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)', lineHeight: 1.3 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Comisiones — solo si es ejecutivo */}
            {form.role === 'executive' && (
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarSign size={13} color="#16a34a" /> Comisiones por tipo de lead y servicio
                </label>
                <CommissionRulesInline
                  rules={newRules}
                  onChange={setNewRules}
                  defaults={defaults}
                  activeTab={newRulesTab}
                  onTabChange={setNewRulesTab}
                />
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar usuario ── */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" style={{ maxWidth: editForm.role === 'executive' ? 620 : 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={editUser.name} size={28} />
                Editar: {editUser.name}
              </div>
              <button className="modal-close" onClick={() => setEditUser(null)}><X size={16} /></button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={editForm.name} onChange={e => ef('name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" value={editForm.phone} onChange={e => ef('phone', e.target.value)} placeholder="+521..." />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Rol</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {ROLES.map(({ id, label, Icon, color }) => (
                  <button key={id} type="button"
                    onClick={() => ef('role', id)}
                    style={{
                      padding: '9px 8px', borderRadius: 8, border: `2px solid ${editForm.role === id ? color : 'var(--gray-200)'}`,
                      background: editForm.role === id ? `${color}10` : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s'
                    }}>
                    <Icon size={13} style={{ color }} strokeWidth={1.75} />
                    <span style={{ fontWeight: 600, fontSize: 12, color: editForm.role === id ? color : 'var(--gray-900)' }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Comisiones — solo si es ejecutivo */}
            {editForm.role === 'executive' && (
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarSign size={13} color="#16a34a" /> Comisiones por tipo de lead y servicio
                </label>
                <CommissionRulesInline
                  rules={editRules}
                  onChange={setEditRules}
                  defaults={defaults}
                  activeTab={editRulesTab}
                  onTabChange={setEditRulesTab}
                />
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEditUser(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Resetear contraseña ── */}
      {resetUser && (
        <div className="modal-overlay" onClick={() => setResetUser(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={18} style={{ color: 'var(--orange-500)' }} /> Resetear contraseña
              </div>
              <button className="modal-close" onClick={() => setResetUser(null)}><X size={16} /></button>
            </div>

            <div style={{ marginBottom: 16, padding: 12, background: 'var(--gray-50)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={resetUser.name} size={30} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{resetUser.name}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{resetUser.email}</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nueva contraseña *</label>
              <input className="form-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus />
            </div>

            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 16 }}>
              El usuario deberá usar esta contraseña en su próximo acceso.
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResetUser(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleResetPassword} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} /> {saving ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente inline de reglas de comisión ───────────────────────────────────
function CommissionRulesInline({ rules, onChange, defaults, activeTab, onTabChange }) {
  const lt = LEAD_TYPES.find(t => t.key === activeTab);

  const setRate = (svc, val) => {
    onChange({ ...rules, [activeTab]: { ...rules[activeTab], [svc]: val } });
  };

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginTop: 6 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        {LEAD_TYPES.map(t => (
          <button key={t.key} type="button" onClick={() => onTabChange(t.key)} style={{
            flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            background: activeTab === t.key ? '#fff' : 'transparent',
            color: activeTab === t.key ? t.color : '#9ca3af',
            borderBottom: activeTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {/* Desc */}
      <div style={{ padding: '6px 12px', background: '#fafafa', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
        {lt.desc} — Deja vacío para usar el % global del sistema
      </div>
      {/* Grid 2 columnas */}
      <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        {SERVICE_LIST.map(s => {
          const val = rules[activeTab]?.[s.key] ?? '';
          const def = defaults[s.key];
          const hasVal = val !== '' && val != null;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>{s.label}</span>
              <div style={{ position: 'relative', width: 80 }}>
                <input
                  type="number" min="0" max="100" step="0.5"
                  placeholder={def != null ? `${def}%` : '0%'}
                  value={val}
                  onChange={e => setRate(s.key, e.target.value)}
                  style={{
                    width: '100%', padding: '5px 22px 5px 8px', borderRadius: 6, fontSize: 12,
                    border: `1px solid ${hasVal ? lt.color : '#d1d5db'}`,
                    background: hasVal ? lt.color + '12' : '#fff',
                    color: hasVal ? lt.color : '#374151',
                    fontWeight: hasVal ? 700 : 400, outline: 'none', textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: hasVal ? lt.color : '#9ca3af', pointerEvents: 'none' }}>%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ctxStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '9px 14px', fontSize: 13, color: 'var(--gray-700)',
  background: 'none', border: 'none', width: '100%', textAlign: 'left',
  cursor: 'pointer', transition: 'background .15s',
};

