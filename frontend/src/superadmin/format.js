// Formato compartido por el panel de plataforma. Los importes de IA son
// pequeños: por debajo de un dólar se muestran con 4 decimales para que no se
// vean todos como "$0.00".
export const money = (usd) => {
  const n = Number(usd) || 0;
  const decimals = Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 2;
  return `$${n.toFixed(decimals)}`;
};

export const percent = (value) => `${(Number(value) || 0).toFixed(1)}%`;

export const periodLabel = (period) => {
  if (!period) return '—';
  const [year, month] = String(period).split('-');
  const text = new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const formatDateTime = (iso) => iso
  ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
