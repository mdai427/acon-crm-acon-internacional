import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ isOpen, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} color={danger ? 'var(--red)' : 'var(--orange-500)'} />
            <div className="modal-title">{title || '¿Confirmar acción?'}</div>
          </div>
        </div>
        {message && (
          <p style={{ color: 'var(--text2)', fontSize: 14, margin: '8px 0 20px' }}>{message}</p>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button
            className="btn"
            style={{ background: danger ? 'var(--red)' : 'var(--orange-500)', color: '#fff' }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
