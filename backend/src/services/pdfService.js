/**
 * PDF Service — ACON CRM
 * Generates branded cotización PDFs using PDFKit.
 *
 * Usage:
 *   const { generateQuotePDF } = require('./pdfService');
 *   const pdfBuffer = await generateQuotePDF(quote, { exchangeRate: 17 });
 */
const PDFDocument = require('pdfkit');

// Brand colors
const PRIMARY   = '#1E3A5F';  // navy
const ACCENT    = '#2563EB';  // blue
const GRAY      = '#6B7280';
const LIGHT_BG  = '#F8FAFC';
const GREEN     = '#16A34A';
const RED       = '#DC2626';

const SERVICE_LABELS = {
  maritimo_fcl:           'Marítimo FCL',
  maritimo_lcl:           'Marítimo LCL',
  aereo:                  'Aéreo',
  terrestre_full:         'Terrestre Full',
  terrestre_sencillo:     'Terrestre Sencillo',
  terrestre_economico:    'Terrestre Económico',
  almacenaje:             'Almacenaje',
  aduanal_importacion:    'Aduanal Importación',
  aduanal_exportacion:    'Aduanal Exportación',
};

const STATUS_LABELS = {
  draft:              'Borrador',
  pending_approval:   'Pendiente de aprobación',
  approved:           'Aprobada',
  rejected_approval:  'Rechazada',
  sent:               'Enviada',
  accepted:           'Aceptada',
  rejected:           'Rechazada por cliente',
  expired:            'Vencida',
};

/**
 * Generate a PDF buffer for a quote.
 * @param {object} quote — Mongoose lean doc, with populated createdBy
 * @param {object} opts  — { exchangeRate }
 * @returns {Promise<Buffer>}
 */
function generateQuotePDF(quote, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 100; // minus margins

      // ── Header ──────────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY);

      doc.font('Helvetica-Bold').fontSize(22).fillColor('#ffffff')
        .text('ACON INTERNACIONAL', 50, 22);
      doc.font('Helvetica').fontSize(10).fillColor('#93C5FD')
        .text('Agentes de Carga Internacional', 50, 48);
      doc.font('Helvetica').fontSize(9).fillColor('#BFDBFE')
        .text('contacto@acon.mx  •  +52 (33) 1234-5678  •  www.acon.mx', 50, 62);

      // Folio + fecha (top right)
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
        .text(quote.folio || '—', doc.page.width - 200, 22, { width: 150, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor('#93C5FD')
        .text(
          `Fecha: ${new Date(quote.createdAt || Date.now()).toLocaleDateString('es-MX')}`,
          doc.page.width - 200, 44, { width: 150, align: 'right' }
        );
      doc.font('Helvetica').fontSize(9).fillColor('#93C5FD')
        .text(
          `Válido hasta: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('es-MX') : '—'}`,
          doc.page.width - 200, 60, { width: 150, align: 'right' }
        );

      let y = 110;

      // ── Title ───────────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(16).fillColor(PRIMARY)
        .text('COTIZACIÓN DE SERVICIOS DE CARGA', 50, y);
      y += 20;
      doc.font('Helvetica').fontSize(11).fillColor(GRAY)
        .text(SERVICE_LABELS[quote.serviceType] || quote.serviceType || '—', 50, y);
      y += 24;

      // Divider
      doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor('#E2E8F0').stroke();
      y += 14;

      // ── Two-column info ──────────────────────────────────────────────────────
      const col1 = 50, col2 = 330, colW = 240;

      const infoBlock = (label, value, cx, cy) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text(label, cx, cy);
        doc.font('Helvetica').fontSize(10).fillColor('#1F2937').text(value || '—', cx, cy + 11, { width: colW });
      };

      // Left column — client
      doc.rect(col1, y, colW, 90).fill(LIGHT_BG);
      doc.rect(col2, y, colW, 90).fill(LIGHT_BG);

      infoBlock('CLIENTE', quote.clientName, col1 + 8, y + 8);
      infoBlock('CONTACTO', quote.contactName, col1 + 8, y + 36);
      infoBlock('EMAIL', quote.clientEmail, col1 + 8, y + 62);

      // Right column — route
      infoBlock('ORIGEN', quote.origin, col2 + 8, y + 8);
      infoBlock('DESTINO', quote.destination, col2 + 8, y + 36);
      infoBlock('INCOTERM', quote.incoterm, col2 + 8, y + 62);

      y += 104;

      // Carrier + additional info row
      if (quote.carrier || quote.commodity || quote.containerType) {
        doc.rect(col1, y, pageWidth, 32).fill(LIGHT_BG);
        let x = col1 + 8;
        if (quote.carrier) {
          infoBlock('CARRIER / NAVIERA', quote.carrier, x, y + 4);
          x += 150;
        }
        if (quote.containerType) {
          infoBlock('CONTENEDOR', quote.containerType, x, y + 4);
          x += 120;
        }
        if (quote.commodity) {
          infoBlock('MERCANCÍA', quote.commodity, x, y + 4);
        }
        y += 46;
      }

      // ── FCL Routes table ────────────────────────────────────────────────────
      if (quote.routes && quote.routes.length > 0) {
        y += 6;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY).text('TARIFAS DE RUTA', 50, y);
        y += 14;

        // Table header
        const rCols = ['Origen', 'POL', 'POD', 'Días', '20\'', '40\'', '40\'HC'];
        const rWidths = [70, 70, 70, 40, 55, 55, 55];
        doc.rect(50, y, pageWidth, 20).fill(PRIMARY);
        let rx = 50;
        rCols.forEach((h, i) => {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text(h, rx + 4, y + 6, { width: rWidths[i] });
          rx += rWidths[i];
        });
        y += 20;

        quote.routes.forEach((r, idx) => {
          doc.rect(50, y, pageWidth, 18).fill(idx % 2 === 0 ? '#fff' : LIGHT_BG);
          rx = 50;
          const cells = [r.origen, r.pol, r.pod, r.transitDays, r.price20, r.price40, r.price40HC];
          cells.forEach((c, i) => {
            const val = i >= 4 ? (c ? `$${Number(c).toLocaleString()}` : '—') : (c || '—');
            doc.font('Helvetica').fontSize(8).fillColor('#1F2937').text(val, rx + 4, y + 5, { width: rWidths[i] });
            rx += rWidths[i];
          });
          y += 18;
        });
        y += 10;
      }

      // ── Line items table ─────────────────────────────────────────────────────
      if (quote.items && quote.items.length > 0) {
        y += 4;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY).text('PARTIDAS', 50, y);
        y += 14;

        const cols = ['Concepto', 'Unidad', 'Cant.', 'Precio Unit.', 'Moneda', 'Subtotal'];
        const widths = [200, 60, 40, 80, 55, 80];
        doc.rect(50, y, pageWidth, 20).fill(PRIMARY);
        let cx = 50;
        cols.forEach((h, i) => {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text(h, cx + 4, y + 6, { width: widths[i] });
          cx += widths[i];
        });
        y += 20;

        quote.items.forEach((item, idx) => {
          const subtotal = (item.qty || 1) * (item.unitPrice || 0);
          doc.rect(50, y, pageWidth, 18).fill(idx % 2 === 0 ? '#fff' : LIGHT_BG);
          cx = 50;
          const cells = [
            item.concept,
            item.unit || 'Global',
            String(item.qty || 1),
            `$${(item.unitPrice || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            item.currency || 'USD',
            `$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
          ];
          cells.forEach((c, i) => {
            doc.font('Helvetica').fontSize(8).fillColor('#1F2937').text(c, cx + 4, y + 5, { width: widths[i] });
            cx += widths[i];
          });
          y += 18;

          // New page if needed
          if (y > doc.page.height - 140) { doc.addPage(); y = 50; }
        });
        y += 10;
      }

      // ── Totals ───────────────────────────────────────────────────────────────
      const totW = 220;
      const totX = 50 + pageWidth - totW;
      y += 6;

      const totalsBox = (label, value, highlight = false) => {
        doc.rect(totX, y, totW, 22).fill(highlight ? ACCENT : LIGHT_BG);
        doc.font('Helvetica-Bold').fontSize(highlight ? 11 : 9)
          .fillColor(highlight ? '#fff' : GRAY)
          .text(label, totX + 10, y + 6, { width: 100 });
        doc.font('Helvetica-Bold').fontSize(highlight ? 11 : 9)
          .fillColor(highlight ? '#fff' : '#1F2937')
          .text(value, totX + 110, y + 6, { width: 100, align: 'right' });
        y += 24;
      };

      if (quote.totalUSD > 0) totalsBox('TOTAL USD', `$${(quote.totalUSD || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} USD`, true);
      if (quote.totalMXN > 0) totalsBox('TOTAL MXN', `$${(quote.totalMXN || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`, quote.totalUSD === 0);

      if (opts.exchangeRate && quote.totalUSD > 0) {
        const totalMXNEq = quote.totalUSD * opts.exchangeRate;
        totalsBox(`Equivalente MXN (T/C ${opts.exchangeRate})`, `$${totalMXNEq.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`);
      }

      y += 16;

      // ── Additional charges ───────────────────────────────────────────────────
      if (quote.additionalCharges) {
        const ac = quote.additionalCharges;
        if (ac.docFee || ac.releaseFee || ac.freeDays) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('CARGOS ADICIONALES', 50, y);
          y += 12;
          if (ac.docFee) { doc.font('Helvetica').fontSize(8).fillColor('#374151').text(`• Doc Fee: $${ac.docFee}`, 50, y); y += 12; }
          if (ac.releaseFee) { doc.font('Helvetica').fontSize(8).fillColor('#374151').text(`• Release Fee: $${ac.releaseFee}`, 50, y); y += 12; }
          if (ac.freeDays) { doc.font('Helvetica').fontSize(8).fillColor('#374151').text(`• Días libres: ${ac.freeDays} días`, 50, y); y += 12; }
          if (ac.cartaGarantia) { doc.font('Helvetica').fontSize(8).fillColor('#374151').text(`• Carta de garantía: ${ac.cartaGarantia}`, 50, y); y += 12; }
          y += 8;
        }
      }

      // ── Notes ────────────────────────────────────────────────────────────────
      if (quote.notes) {
        if (y > doc.page.height - 160) { doc.addPage(); y = 50; }
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('NOTAS', 50, y);
        y += 12;
        doc.font('Helvetica').fontSize(8).fillColor('#374151').text(quote.notes, 50, y, { width: pageWidth });
        y += doc.heightOfString(quote.notes, { width: pageWidth }) + 12;
      }

      if (quote.terms) {
        if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('TÉRMINOS Y CONDICIONES', 50, y);
        y += 12;
        doc.font('Helvetica').fontSize(7).fillColor(GRAY).text(quote.terms, 50, y, { width: pageWidth });
        y += doc.heightOfString(quote.terms, { width: pageWidth, fontSize: 7 }) + 12;
      }

      // ── Footer ───────────────────────────────────────────────────────────────
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill(LIGHT_BG);
      doc.moveTo(50, footerY).lineTo(50 + pageWidth, footerY).strokeColor('#E2E8F0').stroke();
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
        .text(`Preparado por: ${quote.createdBy?.name || '—'}`, 50, footerY + 10);
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
        .text(`Estado: ${STATUS_LABELS[quote.status] || quote.status || '—'}`, 50, footerY + 22);
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
        .text('ACON Internacional • Agentes de Carga • México', 50, footerY + 22, { width: pageWidth, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
        .text(`Vigencia: ${quote.validity || 15} días a partir de la fecha de emisión`, 50, footerY + 34, { width: pageWidth, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateQuotePDF };
