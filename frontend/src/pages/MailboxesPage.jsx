import React, { useCallback, useEffect, useState } from 'react';
import {
  getAllMailboxes, createMailbox, updateMailbox, deleteMailbox,
  getUsers, getSuppressions, releaseEmail,
} from '../services/api';
import {
  Mail, Plus, Save, Trash2, AtSign, ShieldAlert, RotateCcw, Star, X,
} from 'lucide-react';

// Motivos por los que una dirección deja de recibir correo, en lenguaje del
// asesor: "rebote duro" no le dice nada, "la dirección no existe" sí.
const BLOCK_REASONS = {
  hard_bounce:  { label: 'La dirección no existe',    color: '#DC2626' },
  complaint:    { label: 'Marcó el correo como spam', color: '#B91C1C' },
  soft_bounces: { label: 'Rebotó varias veces',       color: '#EA580C' },
  manual:       { label: 'Bloqueo manual / baja',     color: '#6B7280' },
};

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy-900)', marginBottom: 5 }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

// ── Alta de buzón ───────────────────────────────────────────────────
function NewMailboxForm({ domain, users, onCreate, toast }) {
  const [form, setForm] = useState({ localPart: '', displayName: '', assignedTo: '', forwardTo: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.localPart.trim()) { toast('Escribe el nombre del correo', 'error'); return; }
    setSaving(true);
    try {
      await onCreate({ ...form, assignedTo: form.assignedTo || null });
      setForm({ localPart: '', displayName: '', assignedTo: '', forwardTo: '' });
      toast(`Buzón ${form.localPart}@${domain} creado`, 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo crear el buzón', 'error');
    } finally { setSaving(false); }
  };

  if (!domain) {
    return (
      <div className="card" style={{ borderColor: '#F59E0B55', background: '#FFFBEB' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ShieldAlert size={18} color="#B45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#92400E', fontSize: 14 }}>Falta el dominio de buzones</div>
            <p style={{ fontSize: 12, color: '#92400E', margin: '6px 0 0', lineHeight: 1.6 }}>
              Configura <code>INBOUND_EMAIL_DOMAIN</code> con el subdominio que apunta a Resend
              (por ejemplo <code>mail.aconinternacional.com</code>) y verifica sus registros MX.
              Hasta entonces no se pueden crear direcciones.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Plus size={16} color="var(--orange-500)" />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--navy-900)' }}>Nuevo buzón</h3>
      </div>

      <Field label="Dirección" hint="Solo letras, números, punto y guion. No se puede cambiar después.">
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <input
            className="input"
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            placeholder="ventas"
            value={form.localPart}
            onChange={e => setForm(f => ({ ...f, localPart: e.target.value.toLowerCase().trim() }))}
          />
          <span style={{
            display: 'flex', alignItems: 'center', padding: '0 12px',
            background: 'var(--gray-100)', border: '1px solid var(--border)', borderLeft: 'none',
            borderTopRightRadius: 8, borderBottomRightRadius: 8,
            fontSize: 13, color: 'var(--gray-500)', whiteSpace: 'nowrap',
          }}>@{domain}</span>
        </div>
      </Field>

      <Field label="Nombre visible" hint="Es lo que ve el destinatario en su bandeja.">
        <input className="input" placeholder="Ventas ACON Worldwide"
          value={form.displayName}
          onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
      </Field>

      <Field label="Asignar a" hint="Recibe las notificaciones de los correos entrantes.">
        <select className="input" value={form.assignedTo}
          onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
          <option value="">Sin asignar (buzón compartido)</option>
          {users.map(u => <option key={u._id} value={u._id}>{u.name} — {u.role}</option>)}
        </select>
      </Field>

      <Field label="Reenviar copia a" hint="Opcional: además del CRM, una copia al correo personal del asesor.">
        <input className="input" type="email" placeholder="asesor@gmail.com"
          value={form.forwardTo}
          onChange={e => setForm(f => ({ ...f, forwardTo: e.target.value }))} />
      </Field>

      <button type="submit" className="btn btn-navy" disabled={saving} style={{ width: '100%' }}>
        {saving ? 'Creando…' : 'Crear buzón'}
      </button>
    </form>
  );
}

// ── Buzón existente ─────────────────────────────────────────────────
function MailboxCard({ mailbox, users, onSave, onDelete, toast }) {
  const [form, setForm] = useState(mailbox);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(mailbox); setDirty(false); }, [mailbox]);

  const update = (patch) => { setForm(f => ({ ...f, ...patch })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(mailbox._id, {
        displayName: form.displayName,
        assignedTo: form.assignedTo?._id || form.assignedTo || null,
        forwardTo: form.forwardTo,
        signature: form.signature,
        isDefault: form.isDefault,
        isActive: form.isActive,
      });
      setDirty(false);
      toast('Buzón actualizado', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo guardar', 'error');
    } finally { setSaving(false); }
  };

  const assignedId = form.assignedTo?._id || form.assignedTo || '';

  return (
    <div className="card" style={{ opacity: form.isActive ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: 'var(--orange-light)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <AtSign size={16} color="var(--orange-500)" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {mailbox.address}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
            {form.isActive ? 'Activo' : 'Desactivado'}
            {form.isDefault && ' · Remitente por defecto'}
          </div>
        </div>
        {form.isDefault && <Star size={15} color="#F59E0B" fill="#F59E0B" />}
      </div>

      <Field label="Nombre visible">
        <input className="input" value={form.displayName || ''}
          onChange={e => update({ displayName: e.target.value })} />
      </Field>

      <Field label="Asignado a">
        <select className="input" value={assignedId}
          onChange={e => update({ assignedTo: e.target.value })}>
          <option value="">Sin asignar (compartido)</option>
          {users.map(u => <option key={u._id} value={u._id}>{u.name} — {u.role}</option>)}
        </select>
      </Field>

      <Field label="Reenviar copia a">
        <input className="input" type="email" placeholder="(sin reenvío)" value={form.forwardTo || ''}
          onChange={e => update({ forwardTo: e.target.value })} />
      </Field>

      <Field label="Firma HTML" hint="Se agrega al final de cada correo enviado desde este buzón.">
        <textarea className="input" rows={3} style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
          placeholder="<p>Saludos,<br>Ventas ACON</p>"
          value={form.signature || ''}
          onChange={e => update({ signature: e.target.value })} />
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gray-600)', marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form.isDefault}
          onChange={e => update({ isDefault: e.target.checked })} />
        Usar como remitente por defecto del sistema
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-navy btn-sm" onClick={save} disabled={!dirty || saving} style={{ flex: 1 }}>
          <Save size={13} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {form.isActive && (
          <button className="btn btn-ghost btn-sm" title="Desactivar"
            onClick={() => onDelete(mailbox)}>
            <Trash2 size={13} color="#DC2626" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Direcciones bloqueadas ──────────────────────────────────────────
function SuppressionList({ items, onRelease, toast }) {
  if (!items.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: 0 }}>
        Ninguna dirección bloqueada. Cuando un correo rebote en firme o alguien marque spam,
        aparecerá aquí y el CRM dejará de escribirle automáticamente.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map(item => {
        const reason = BLOCK_REASONS[item.reason] || BLOCK_REASONS.manual;
        return (
          <div key={item._id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 9,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.address}
              </div>
              <div style={{ fontSize: 11, color: reason.color, marginTop: 2 }}>
                {reason.label}
                {item.detail && <span style={{ color: 'var(--gray-500)' }}> · {item.detail}</span>}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" title="Reactivar envío"
              onClick={async () => {
                try {
                  await onRelease(item.address);
                  toast(`${item.address} reactivado`, 'success');
                } catch (err) {
                  toast(err.response?.data?.message || 'No se pudo reactivar', 'error');
                }
              }}>
              <RotateCcw size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────
export default function MailboxesPage({ toast }) {
  const [mailboxes, setMailboxes] = useState([]);
  const [domain, setDomain] = useState('');
  const [users, setUsers] = useState([]);
  const [suppressions, setSuppressions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      const [mb, us, sp] = await Promise.all([getAllMailboxes(), getUsers(), getSuppressions()]);
      setMailboxes(mb.data.data || []);
      setDomain(mb.data.domain || '');
      setUsers((us.data.data || us.data || []).filter(u => u.isActive !== false));
      setSuppressions(sp.data.data || []);
    } catch {
      toast('No se pudieron cargar los buzones', 'error');
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => { await createMailbox(data); await load(); };
  const handleSave = async (id, data) => { await updateMailbox(id, data); await load(); };
  const handleRelease = async (address) => { await releaseEmail(address); await load(); };

  const confirmAndDelete = async () => {
    try {
      await deleteMailbox(confirmDelete._id);
      toast(`${confirmDelete.address} desactivado`, 'success');
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo desactivar', 'error');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Cargando buzones…</div>;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 20, fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>
          <Mail size={20} color="var(--orange-500)" /> Buzones de correo
        </h1>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '6px 0 0', maxWidth: 720, lineHeight: 1.6 }}>
          Direcciones del dominio que envían y reciben dentro del CRM. Los correos entrantes
          aparecen en el chat del lead junto a WhatsApp y llamadas. No son cuentas de Gmail:
          no tienen contraseña ni bandeja aparte.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <NewMailboxForm domain={domain} users={users} onCreate={handleCreate} toast={toast} />

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldAlert size={16} color="#DC2626" />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--navy-900)' }}>
                Envío bloqueado ({suppressions.length})
              </h3>
            </div>
            <SuppressionList items={suppressions} onRelease={handleRelease} toast={toast} />
          </div>
        </div>

        {mailboxes.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gray-500)' }}>
            <Mail size={30} style={{ opacity: 0.3, marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13 }}>Todavía no hay buzones. Crea el primero a la izquierda.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {mailboxes.map(mb => (
              <MailboxCard key={mb._id} mailbox={mb} users={users}
                onSave={handleSave} onDelete={setConfirmDelete} toast={toast} />
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(11,37,69,.45)',
          display: 'grid', placeItems: 'center', zIndex: 100, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 420, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--navy-900)', flex: 1 }}>
                Desactivar {confirmDelete.address}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}><X size={14} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6, margin: '0 0 16px' }}>
              Deja de enviar y de recibir por esta dirección. El historial de correos ya
              recibidos se conserva en cada lead. No se borra nada.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn btn-sm" style={{ background: '#DC2626', color: '#fff' }} onClick={confirmAndDelete}>
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
