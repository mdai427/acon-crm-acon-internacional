import React from 'react';

export function ScoreBadge({ score }) {
  const cls = score >= 70 ? 'badge-score-high' : score >= 40 ? 'badge-score-med' : 'badge-score-low';
  return <span className={`badge ${cls}`}>{score}</span>;
}

export function StageBadge({ stage }) {
  const labels = {
    new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
    proposal: 'Propuesta', negotiation: 'Negociación',
    closed_won: '✓ Ganado', closed_lost: '✗ Perdido'
  };
  return <span className={`badge badge-${stage}`}>{labels[stage] || stage}</span>;
}

export function SourceBadge({ source }) {
  const icons = {
    web: '🌐', facebook: '📘', instagram: '📸', linkedin: '💼',
    referral: '👥', whatsapp: '💬', email: '📧', cold_call: '📞', other: '📌'
  };
  return (
    <span className="badge badge-source">
      {icons[source] || '📌'} {source}
    </span>
  );
}
