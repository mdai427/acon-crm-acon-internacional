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
  const [commissionsUser, setCommissionsUser] = useState(null); // user to configure commissions

  const load = () => {
    setLoading(true);
    getUsers()
      .then(r => setUsers(r.data.data || []))
      .catch(() => toast('Error al cargar usuarios', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Close menu on outside click
  useEffect(() => {
    const close = () => setMenuOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return toast('Nombre, email y contraseña son requeridos', 'error');
    if (form.password.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error');
    setSaving(true);
    try {
      await createUser(form);
      toast(`Usuario ${form.name} creado`, 'success');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al crear usuario', 'error');
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      await updateUser(editUser._id, editForm);
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
                            {u.role === 'executive' && (
                              <button className="ctx-item" onClick={() => { setCommissionsUser(u); setMenuOpen(null); }} style={{ ...ctxStyle, color: '#16a34a' }}>
                                <DollarSign size={13} /> Comisiones del ejecutivo
                              </button>
                            )}
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
          <div className="modal" onClick={e => e.stopPropagation()}>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
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

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEditUser(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Configurar comisiones ── */}
      {commissionsUser && (
        <CommissionConfigModal
          user={commissionsUser}
          onClose={() => setCommissionsUser(null)}
          toast={toast}
        />
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

const ctxStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '9px 14px', fontSize: 13, color: 'var(--gray-700)',
  background: 'none', border: 'none', width: '100%', textAlign: 'left',
  cursor: 'pointer', transition: 'background .15s',
};

// ── CommissionConfigModal ─────────────────────────────────────────────────────
const SERVICE_LABELS = {
  maritimo_import:    'Marítimo Importación',
  maritimo_export:    'Marítimo Exportación',
  aereo_import:       'Aéreo Importación',
  aereo_export:       'Aéreo Exportación',
  terrestre_usa:      'Terrestre USA',
  terrestre_nacional: 'Terrestre Nacional',
  despacho_aduanal:   'Despacho Aduanal',
  almacenaje:         'Almacenaje',
  seguro_carga:       'Seguro de Carga',
  otro:               'Otro',
};

const LEAD_TYPES = [
  { key: 'campaign', label: 'Lead de Campaña',        color: '#7c3aed', bg: '#ede9fe', desc: 'Lead generado por publicidad o marketing pagado' },
  { key: 'direct',   label: 'Lead Directo',           color: '#0369a1', bg: '#e0f2fe', desc: 'Prospectado directamente por el ejecutivo' },
  { key: 'referral', label: 'Lead por Recomendación', color: '#15803d', bg: '#dcfce7', desc: 'Referido por cliente o contacto' },
];

function CommissionConfigModal({ user, onClose, toast }) {
  const [defaults, setDefaults] = useState({});
  const [rules, setRules] = useState({ campaign: {}, direct: {}, referral: {} });
  const [activeTab, setActiveTab] = useState('campaign');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getCommissionRules(user._id), getCommissionsConfig()])
      .then(([rulesRes, cfgRes]) => {
        const existing = rulesRes.data.data.user?.commissionRules || {};
        setDefaults(cfgRes.data.data || {});
        // Inicializar con los valores existentes (null = usar default)
        const init = { campaign: {}, direct: {}, referral: {} };
        for (const lt of ['campaign', 'direct', 'referral']) {
          for (const svc of Object.keys(SERVICE_LABELS)) {
            const v = existing?.[lt]?.[svc];
            init[lt][svc] = v != null ? String(v) : '';
          }
        }
        setRules(init);
      })
      .catch(() => toast('Error al cargar reglas', 'error'))
      .finally(() => setLoading(false));
  }, [user._id]);

  const setRate = (lt, svc, val) => {
    setRules(r => ({ ...r, [lt]: { ...r[lt], [svc]: val } }));
  };

  const clearAll = (lt) => {
    setRules(r => {
      const next = { ...r[lt] };
      for (const k of Object.keys(next)) next[k] = '';
      return { ...r, [lt]: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Convertir strings a números (null si vacío = usar default)
      const toSave = { campaign: {}, direct: {}, referral: {} };
      for (const lt of ['campaign', 'direct', 'referral']) {
        for (const svc of Object.keys(SERVICE_LABELS)) {
          const v = rules[lt][svc];
          toSave[lt][svc] = v !== '' && v != null ? parseFloat(v) : null;
        }
      }
      await saveCommissionRules(user._id, toSave);
      toast(`Reglas de comisión de ${user.name} guardadas`, 'success');
      onClose();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  const lt = LEAD_TYPES.find(t => t.key === activeTab);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 660, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={user.name} size={36} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0B2545' }}>Comisiones de {user.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Configura el % por tipo de lead y servicio · Deja vacío para usar el default del sistema</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>
        ) : (
          <>
            {/* Tabs por tipo de lead */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '0 24px' }}>
              {LEAD_TYPES.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13,
                  color: activeTab === t.key ? t.color : '#6b7280',
                  borderBottom: activeTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Descripción del tipo */}
            <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: lt.bg, borderRadius: 8, fontSize: 12, color: lt.color, fontWeight: 500 }}>
              <Info size={13} style={{ display: 'inline', marginRight: 6 }} />
              {lt.desc}
            </div>

            {/* Tabla de servicios */}
            <div style={{ padding: '16px 24px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  Ingresa el % de comisión sobre la <strong>utilidad</strong>. Celdas vacías usan el default del sistema.
                </div>
                <button onClick={() => clearAll(activeTab)} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                  Limpiar todo (usar defaults)
                </button>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>Servicio</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: '#374151', fontSize: 12 }}>% Default sistema</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: lt.color, fontSize: 12 }}>% Para este ejecutivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(SERVICE_LABELS).map(([svc, label], i) => {
                      const val = rules[activeTab][svc];
                      const def = defaults[svc];
                      const hasCustom = val !== '' && val != null;
                      return (
                        <tr key={svc} style={{ borderTop: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '10px 16px', color: '#111827', fontWeight: 500 }}>{label}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                            <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                              {def}%
                            </span>
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                              <input
                                type="number"
                                min="0" max="100" step="0.5"
                                placeholder={`${def} (default)`}
                                value={val}
                                onChange={e => setRate(activeTab, svc, e.target.value)}
                                style={{
                                  width: 120, padding: '6px 28px 6px 10px', borderRadius: 8, fontSize: 13, textAlign: 'center',
                                  border: `1px solid ${hasCustom ? lt.color : '#d1d5db'}`,
                                  background: hasCustom ? lt.bg : '#fff',
                                  color: hasCustom ? lt.color : '#374151',
                                  fontWeight: hasCustom ? 700 : 400,
                                  outline: 'none',
                                }}
                              />
                              {hasCustom && (
                                <span style={{ position: 'absolute', right: 8, fontSize: 11, color: lt.color, fontWeight: 700 }}>%</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                Los cambios aplican a todas las nuevas comisiones de {user.name}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                  Cancelar
                </button>
                <button onClick={save} disabled={saving} style={{ padding: '9px 20px', background: '#0B2545', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  {saving ? 'Guardando...' : '💾 Guardar Reglas'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
