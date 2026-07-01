import React, { useRef } from 'react';
import { X, Printer, Download } from 'lucide-react';

// ── Brand constants ────────────────────────────────────────────────────────────
const NAVY  = '#0B2545';
const ORANGE = '#F2641E';
const ORANGE2 = '#F58220';

const SERVICE_LABELS = {
  maritimo_fcl: 'Ocean Freight – FCL',
  maritimo_lcl: 'Ocean Freight – LCL',
  aereo: 'Air Freight',
  terrestre_full: 'Terrestre Full',
  terrestre_sencillo: 'Terrestre Sencillo',
  terrestre_economico: 'Terrestre Económico',
  almacenaje: 'Almacenaje',
  aduanal_importacion: 'Despacho Aduanal – Importación',
  aduanal_exportacion: 'Despacho Aduanal – Exportación',
};

const IS_FCL = (svc) => svc === 'maritimo_fcl' || svc === 'maritimo_lcl';

const fmt = (v, curr = 'USD') => {
  if (!v && v !== 0) return '—';
  return `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 0 })} ${curr}`;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

// ── Print styles injected into the page head ───────────────────────────────────
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #acon-quote-print, #acon-quote-print * { visibility: visible !important; }
  #acon-quote-print {
    position: fixed !important;
    top: 0 !important; left: 0 !important;
    width: 100% !important; height: auto !important;
    z-index: 99999 !important;
    background: white !important;
    margin: 0 !important; padding: 0 !important;
    overflow: visible !important;
  }
  .no-print { display: none !important; }
  @page { margin: 0; size: A4 portrait; }
}
`;

export default function QuotePreviewModal({ quote, onClose, user }) {
  const printRef = useRef(null);

  const handlePrint = () => {
    // Inject print styles if not already done
    const existing = document.getElementById('acon-print-style');
    if (!existing) {
      const style = document.createElement('style');
      style.id = 'acon-print-style';
      style.innerHTML = PRINT_CSS;
      document.head.appendChild(style);
    }
    window.print();
  };

  const isFCL = IS_FCL(quote.serviceType);
  const serviceLabel = SERVICE_LABELS[quote.serviceType] || quote.serviceType;
  const ac = quote.additionalCharges || {};
  const routes = quote.routes || [];
  const items  = quote.items  || [];

  return (
    <div className="modal-overlay" style={{ zIndex: 3000, alignItems: 'flex-start', padding: '20px', overflowY: 'auto' }}>
      {/* Toolbar — hidden on print */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, right: 16, zIndex: 3001,
        display: 'flex', gap: 8, alignItems: 'center'
      }}>
        <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Printer size={14} /> Imprimir / Descargar PDF
        </button>
        <button className="btn btn-ghost" onClick={onClose} style={{ background: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
          <X size={14} /> Cerrar
        </button>
      </div>

      {/* ── Quote document ──────────────────────────────────────────────────── */}
      <div id="acon-quote-print" ref={printRef} style={{
        width: 794, // A4 width in px at 96dpi
        margin: '0 auto',
        background: 'white',
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        fontSize: 11,
        color: '#1a1f2e',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>

        {/* ═══════════════════════════════════════════════════════
            SECTION 1: HEADER BANNER
            ═══════════════════════════════════════════════════ */}
        <div style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #0d2e5a 40%, #1a3a6b 70%, #0B2545 100%)`,
          padding: '28px 32px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background grid pattern */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(circle at 20% 80%, rgba(242,100,30,0.12) 0%, transparent 50%),
                              radial-gradient(circle at 80% 20%, rgba(242,130,32,0.08) 0%, transparent 50%)`,
          }} />

          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
            {/* Logo */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {/* Stylized ACON logo mark */}
                <div style={{
                  width: 52, height: 52,
                  background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE2} 100%)`,
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 22, color: 'white',
                  letterSpacing: -1, boxShadow: '0 4px 12px rgba(242,100,30,0.4)',
                }}>A</div>
                <div>
                  <div style={{ color: 'white', fontWeight: 900, fontSize: 26, letterSpacing: 3, lineHeight: 1 }}>ACON</div>
                  <div style={{ color: ORANGE, fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>Worldwide Logística</div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 500, letterSpacing: 1 }}>CONECTAMOS DESTINOS</div>
                <div style={{ color: ORANGE, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>IMPULSAMOS NEGOCIOS</div>
              </div>
            </div>

            {/* WCA World badge */}
            <div style={{
              background: 'white',
              borderRadius: 10,
              padding: '10px 16px',
              textAlign: 'center',
              boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#1a5fac', letterSpacing: 1 }}>WCA</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#1a5fac', lineHeight: 1 }}>world</div>
              <div style={{ fontSize: 7, color: '#666', marginTop: 3 }}>Leading the World in</div>
              <div style={{ fontSize: 7, color: '#666' }}>Logistics Partnering</div>
              <div style={{
                marginTop: 5, background: '#1a5fac', color: 'white',
                fontSize: 7, fontWeight: 700, padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5
              }}>PROUD MEMBER</div>
            </div>
          </div>

          {/* Decorative lines */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 3,
            background: `linear-gradient(90deg, ${ORANGE} 0%, ${ORANGE2} 50%, transparent 100%)`,
          }} />
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 2: QUOTE META BAR
            ═══════════════════════════════════════════════════ */}
        <div style={{ background: '#f8f9fa', borderBottom: `3px solid ${ORANGE}`, padding: '18px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: NAVY, lineHeight: 1, letterSpacing: -1 }}>COTIZACIÓN</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: ORANGE, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                {serviceLabel}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {/* Folio */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>No. Cotización</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: ORANGE, background: 'white', border: `2px solid ${ORANGE}`, borderRadius: 6, padding: '4px 12px' }}>
                  {quote.folio || 'COT-0000'}
                </div>
              </div>
              {/* Fecha */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Fecha efectiva</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, background: 'white', border: '1.5px solid #e0e0e0', borderRadius: 6, padding: '4px 12px' }}>
                  {fmtDate(quote.createdAt || new Date())}
                </div>
              </div>
              {/* Vigencia */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Vigencia</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, background: 'white', border: '1.5px solid #e0e0e0', borderRadius: 6, padding: '4px 12px' }}>
                  {fmtDate(quote.validUntil)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 3: CLIENT INFO + OPERATION DETAILS
            ═══════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #e8e8e8' }}>

          {/* Client Info */}
          <div style={{ padding: '18px 24px', borderRight: '1px solid #e8e8e8' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              paddingBottom: 8, borderBottom: `2px solid ${ORANGE}`,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6, background: ORANGE + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12
              }}>👤</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 1 }}>
                Información del Cliente
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Empresa', quote.clientName || '—'],
                  ['Dirección', quote.clientAddress || '—'],
                  ['Contacto', quote.contactName || '—'],
                  ['Teléfono', quote.clientPhone || '—'],
                  ['E-Mail', quote.clientEmail || '—'],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: '4px 0', width: 75, fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, verticalAlign: 'top' }}>{label}:</td>
                    <td style={{ padding: '4px 0 4px 8px', fontSize: 11, color: '#1a1f2e', fontWeight: label === 'Empresa' ? 700 : 400 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Operation Details + Service Icons */}
          <div style={{ padding: '18px 24px 18px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
              {/* Operation details */}
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                  paddingBottom: 8, borderBottom: `2px solid ${ORANGE}`,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6, background: ORANGE + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12
                  }}>⚙</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Detalles de la Operación
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Origen', quote.origin || '—'],
                      ['Destino', quote.destination || '—'],
                      ['Incoterm', quote.incoterm || '—'],
                      ['Transit Days', quote.containerType || '(Ver tabla)'],
                      ['Payment Terms', quote.paymentTerms || 'Due on receipt service'],
                      ['Sales Rep', quote.salesRep || user?.name || '—'],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ padding: '3px 0', width: 85, fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, verticalAlign: 'top' }}>{label}:</td>
                        <td style={{ padding: '3px 0 3px 6px', fontSize: 10, color: '#1a1f2e', fontWeight: 500 }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Service icons */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Servicios</div>
                {[
                  ['✈', 'Transporte Aéreo'],
                  ['🚢', 'Transporte Marítimo'],
                  ['🚛', 'Transporte Terrestre'],
                  ['🏛', 'Despacho Aduanal'],
                  ['🏭', 'Almacenaje'],
                  ['🛡', 'Seguro de Carga'],
                ].map(([icon, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4,
                      background: NAVY,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
                    }}>{icon}</div>
                    <span style={{ fontSize: 9, color: '#444', fontWeight: 500 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 4A: FCL ROUTES TABLE
            ═══════════════════════════════════════════════════ */}
        {isFCL && routes.length > 0 && (
          <div style={{ padding: '0 24px 0', borderBottom: '1px solid #e8e8e8' }}>
            {/* Routes table */}
            <div style={{
              margin: '16px 0 0',
              borderRadius: 8, overflow: 'hidden',
              border: '1px solid #e0e0e0',
            }}>
              {/* Table title */}
              <div style={{
                background: NAVY, color: 'white',
                padding: '8px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Tarifas {serviceLabel}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>Sujeto a disponibilidad de espacio</span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ background: '#f0f4f8' }}>
                    <th style={thStyle}>Origen</th>
                    <th style={thStyle}>POL</th>
                    <th style={thStyle}>POD</th>
                    <th style={thStyle}>Transit Days</th>
                    <th colSpan={3} style={{ ...thStyle, textAlign: 'center', borderBottom: 'none' }}>TYPE</th>
                    <th style={thStyle}>Currency</th>
                  </tr>
                  <tr style={{ background: '#f0f4f8' }}>
                    <th style={{ ...thStyle, paddingTop: 2 }} />
                    <th style={{ ...thStyle, paddingTop: 2 }} />
                    <th style={{ ...thStyle, paddingTop: 2 }} />
                    <th style={{ ...thStyle, paddingTop: 2 }} />
                    <th style={thStyle}>20'</th>
                    <th style={{ ...thStyle, background: ORANGE, color: 'white' }}>40'</th>
                    <th style={thStyle}>40'HC</th>
                    <th style={{ ...thStyle, paddingTop: 2 }} />
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #eee' }}>
                      <td style={tdStyle}>{r.origen || '—'}</td>
                      <td style={tdStyle}>{r.pol || '—'}</td>
                      <td style={tdStyle}>{r.pod || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ background: '#f0f4f8', borderRadius: 4, padding: '2px 6px', fontSize: 9, fontWeight: 600 }}>
                          {r.transitDays || '—'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                        {r.price20 ? `$${Number(r.price20).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: NAVY, background: '#fff8f0' }}>
                        {r.price40 ? `$${Number(r.price40).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                        {r.price40HC ? `$${Number(r.price40HC).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#666', fontWeight: 500 }}>
                        {r.currency || 'USD'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Additional charges — only for FCL */}
            {(ac.docFee || ac.releaseFee || ac.cartaGarantia || ac.freeDays) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, margin: '14px 0 16px', alignItems: 'start' }}>
                <div style={{ fontSize: 9, color: '#666', lineHeight: 1.6 }}>
                  * Tarifas válidas por {quote.validity || 15} días · Sujetas a disponibilidad de espacio al momento de la reserva.
                </div>
                <div style={{
                  background: '#f8f9fa', border: '1px solid #e0e0e0',
                  borderRadius: 8, padding: '10px 16px', minWidth: 180,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingBottom: 5, borderBottom: `2px solid ${ORANGE}` }}>
                    Cargos Adicionales
                  </div>
                  {ac.docFee > 0 && <ChargeRow label="DOC FEE / BL" value={`$${ac.docFee} USD`} />}
                  {ac.releaseFee > 0 && <ChargeRow label="Release FEE / CNTR" value={`$${ac.releaseFee} USD`} />}
                  {ac.cartaGarantia && <ChargeRow label="Carta Garantía" value={ac.cartaGarantia} />}
                  {ac.freeDays > 0 && (
                    <div style={{ marginTop: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Días libres de demoras</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: ORANGE, lineHeight: 1 }}>{ac.freeDays}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: NAVY }}>DÍAS</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            SECTION 4B: ITEMS TABLE (non-FCL or when no routes)
            ═══════════════════════════════════════════════════ */}
        {(!isFCL || routes.length === 0) && items.length > 0 && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e8e8e8' }}>
            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
              <div style={{ background: NAVY, color: 'white', padding: '8px 16px', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                Partidas / Conceptos
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ background: '#f0f4f8' }}>
                    <th style={{ ...thStyle, width: '50%' }}>Concepto</th>
                    <th style={thStyle}>Unidad</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Cant.</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>P. Unit.</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Moneda</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const total = (item.qty || 1) * (item.unitPrice || 0);
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #eee' }}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{item.concept}</td>
                        <td style={tdStyle}>{item.unit}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{item.qty}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>${Number(item.unitPrice || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: item.currency === 'USD' ? '#2563eb' : '#16a34a' }}>{item.currency}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            {(() => {
              const totalUSD = items.filter(i => i.currency === 'USD').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);
              const totalMXN = items.filter(i => i.currency === 'MXN').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);
              return (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 16 }}>
                  {totalUSD > 0 && (
                    <div style={{ background: NAVY, borderRadius: 8, padding: '10px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total USD</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: 'white' }}>${totalUSD.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                    </div>
                  )}
                  {totalMXN > 0 && (
                    <div style={{ background: '#f8f9fa', border: `2px solid ${ORANGE}`, borderRadius: 8, padding: '10px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total MXN</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: ORANGE }}>${totalMXN.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            SECTION 5: WHY ACON + LOGISTICS PROCESS
            ═══════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 0, borderBottom: '1px solid #e8e8e8' }}>
          {/* ¿Por qué ACON? */}
          <div style={{ padding: '16px 20px', borderRight: '1px solid #e8e8e8' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              ¿Por qué elegir ACON?
            </div>
            {[
              'Miembro de WCA World',
              'Cobertura en más de 190 países',
              'Red global de más de 12,000 oficinas',
              'Atención personalizada 24/7',
              'Soluciones logísticas integrales',
              'Seguro de carga – Todo riesgo',
              'Rastreo y visibilidad de tu carga',
              'Despacho aduanal en destino',
              'Compromiso total #ACONtigo',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 9.5, color: '#444' }}>
                <span style={{ color: '#22c55e', fontWeight: 900, fontSize: 12 }}>✓</span>
                {item}
              </div>
            ))}
          </div>

          {/* Proceso Logístico */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Proceso Logístico
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
              {[
                { icon: '📦', label: ['Origen', quote.origin || '—'] },
                { arrow: true },
                { icon: '🚢', label: ['Embarque', 'en Puerto'] },
                { arrow: true },
                { icon: '🌊', label: ['Tránsito', 'Marítimo'] },
                { arrow: true },
                { icon: '🏛', label: ['Despacho', 'Aduanal'] },
                { arrow: true },
                { icon: '✅', label: ['Entrega', quote.destination || '—'] },
              ].map((step, i) => (
                step.arrow ? (
                  <div key={i} style={{ color: ORANGE, fontSize: 16, fontWeight: 900, margin: '0 4px', flexShrink: 0 }}>→</div>
                ) : (
                  <div key={i} style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${ORANGE}20, ${ORANGE}40)`,
                      border: `2px solid ${ORANGE}`,
                      margin: '0 auto 4px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                    }}>{step.icon}</div>
                    {step.label.map((l, j) => (
                      <div key={j} style={{ fontSize: 7.5, color: j === 0 ? NAVY : '#888', fontWeight: j === 0 ? 700 : 400, lineHeight: 1.3 }}>{l}</div>
                    ))}
                  </div>
                )
              ))}
            </div>

            {/* ACONtigo quote */}
            <div style={{
              background: `linear-gradient(135deg, ${ORANGE}15, ${ORANGE}05)`,
              border: `1.5px solid ${ORANGE}40`,
              borderRadius: 8, padding: '10px 14px',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <div style={{ fontSize: 20, color: ORANGE, fontWeight: 900, lineHeight: 1 }}>"</div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: NAVY }}>Estoy <span style={{ color: ORANGE, fontWeight: 900 }}>#ACONtigo</span></div>
                <div style={{ fontSize: 9, color: '#666' }}>en cada paso de tu operación.</div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 6: COMENTARIOS / NO INCLUYE / TERMS
            ═══════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid #e8e8e8' }}>

          {/* Comentarios */}
          <div style={{ padding: '14px 18px', borderRight: '1px solid #e8e8e8' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingBottom: 5, borderBottom: `2px solid ${ORANGE}` }}>
              Comentarios
            </div>
            {(quote.notes ? quote.notes.split('\n').filter(Boolean) : [
              'Tarifas válidas por 7 días.',
              'Sujetas a disponibilidad de espacio al momento de la reserva.',
              'No incluye impuestos, maniobras locales, inspecciones, rayos X, certificados, cargos aduanales en origen ni destino.',
              'Aplican tarifas locales del transportista y GRI en destino.',
              'Todos los envíos están sujetos a aprobación.',
            ]).map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 3, fontSize: 8.5, color: '#555', lineHeight: 1.4 }}>
                <span style={{ color: '#888', flexShrink: 0 }}>•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>

          {/* No incluye */}
          <div style={{ padding: '14px 18px', borderRight: '1px solid #e8e8e8' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingBottom: 5, borderBottom: `2px solid ${ORANGE}` }}>
              No Incluye <span style={{ fontSize: 7, fontWeight: 400, color: '#999' }}>(a menos que se especifique)</span>
            </div>
            {[
              'Impuestos locales',
              'Maniobras en origen o destino',
              'Inspecciones gubernamentales',
              'Rayos X / Certificados',
              'Cargos de aduana',
              'Almacenajes y demoras',
              'Cargos de terminal',
              'Seguro (pregunte nuestras tarifas)',
            ].map(item => (
              <div key={item} style={{ display: 'flex', gap: 5, marginBottom: 3, fontSize: 8.5, color: '#555', lineHeight: 1.4 }}>
                <span style={{ color: '#dc2626', flexShrink: 0 }}>✗</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Terms */}
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingBottom: 5, borderBottom: `2px solid ${ORANGE}` }}>
              Terms &amp; Conditions
            </div>
            <div style={{ fontSize: 8, color: '#555', lineHeight: 1.55 }}>
              {quote.terms ||
                'Asegure su carga (COBERTURA TOTAL – TODO RIESGO). NO nos haremos responsables de ningún daño, retraso o pérdida monetaria de ningún tipo si decide no contratar el seguro. El equipo y el espacio están sujetos a disponibilidad. Pueden aplicarse costos de reposición. Las tarifas están sujetas a cambios sin previo aviso. No seremos responsables por caso fortuito o fuerza mayor: demoras climáticas, tormentas, inundaciones, guerra, incendios, entre otros. Los precios LTL/FTL son válidos por 7 días a menos que se acuerde por escrito.'
              }
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 7: FOOTER
            ═══════════════════════════════════════════════════ */}
        <div style={{
          background: NAVY,
          padding: '14px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📞</span> +52 33 1656 4933
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📞</span> +52 33 1656 9159
              </div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✉</span> info@aconinternacional.com
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🌐</span> www.aconinternacional.com
            </div>
          </div>

          {/* #ACONtigo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'white' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>#</span>
              <span style={{ color: ORANGE }}>ACON</span>
              <span style={{ color: 'white', fontStyle: 'italic' }}>tigo</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function ChargeRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, fontSize: 9 }}>
      <span style={{ color: '#555', fontWeight: 500 }}>{label}:</span>
      <span style={{ fontWeight: 700, color: '#1a1f2e' }}>{value}</span>
    </div>
  );
}

const thStyle = {
  padding: '7px 10px',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: 9,
  color: '#444',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  background: '#f0f4f8',
  borderBottom: '2px solid #ddd',
  borderRight: '1px solid #e8e8e8',
};

const tdStyle = {
  padding: '8px 10px',
  color: '#333',
  fontSize: 10,
  borderRight: '1px solid #eee',
  verticalAlign: 'middle',
};
