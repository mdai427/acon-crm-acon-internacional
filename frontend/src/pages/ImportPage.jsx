import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download, Clock } from 'lucide-react';
import { importLeads, getJob, createQuote, getLeads } from '../services/api';

const REQUIRED_COLS = ['company', 'contact'];
const COL_MAP = {
  empresa: 'company', company: 'company', compañia: 'company',
  contacto: 'contact', contact: 'contact', nombre: 'contact',
  email: 'email', correo: 'email',
  telefono: 'phone', phone: 'phone', 'teléfono': 'phone',
  whatsapp: 'whatsapp',
  fuente: 'source', source: 'source',
  etapa: 'stage', stage: 'stage',
  pais: 'country', country: 'country', 'país': 'country',
  notas: 'notes', notes: 'notes',
  valor: 'value', value: 'value',
  servicios: 'services', services: 'services',
};

// Se usa exceljs en lugar de la librería `xlsx` (SheetJS): esa arrastra CVE de
// alta severidad sin parche disponible, y aquí se abren archivos que llegan de
// fuera —listas de clientes, exportaciones de otros sistemas—, que es
// exactamente el caso que esas vulnerabilidades explotan.
const MAX_IMPORT_ROWS = 5000;

// El valor de una celda puede venir como objeto: fórmulas, hipervínculos,
// texto enriquecido o fechas. Se normaliza a texto plano.
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('es-MX');
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map(r => r.text).join('');
    if (value.hyperlink) return String(value.hyperlink);
    return '';
  }
  return String(value);
}

// El lector de CSV de exceljs espera streams de Node, que en el navegador no
// están disponibles de forma fiable. Un CSV es texto plano: se parsea aquí,
// respetando comillas, comas dentro de comillas y comillas escapadas ("").
function parseCsv(text) {
  // El separador se decide una sola vez, mirando la cabecera: Excel en español
  // exporta con ';' y tratar ambos a la vez partiría en dos cualquier campo que
  // contenga el otro carácter.
  const firstLine = text.split('\n')[0] || '';
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';

  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += char;
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(cell => cell.trim()));
}

/**
 * Lee la primera hoja del archivo y devuelve las filas ya mapeadas a los campos
 * del CRM según `map`. La primera fila se toma como cabecera.
 */
async function parseSheet(file, map, isValidRow) {
  const isCsv = file.name.toLowerCase().endsWith('.csv');

  // Se normaliza todo a una matriz de texto: así el mapeo es el mismo para
  // .xlsx y .csv.
  let matrix;
  if (isCsv) {
    matrix = parseCsv(await file.text());
  } else {
    const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    matrix = [];
    sheet.eachRow({ includeEmpty: false }, (excelRow) => {
      const cells = [];
      // `values` es 1-indexado en exceljs; se descarta el hueco inicial.
      excelRow.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cellText(cell.value); });
      matrix.push(cells);
    });
  }

  if (matrix.length < 2) return [];

  const headers = matrix[0].map(h => map[String(h || '').toLowerCase().trim()]);

  const rows = [];
  for (let i = 1; i < matrix.length && rows.length < MAX_IMPORT_ROWS; i++) {
    const out = {};
    headers.forEach((key, col) => {
      if (!key) return;
      const value = String(matrix[i][col] ?? '').trim();
      if (value) out[key] = value;
    });
    if (isValidRow(out)) rows.push(out);
  }
  return rows;
}

function parseXLSX(file) {
  return parseSheet(file, COL_MAP, (r) => r.company || r.contact);
}

/**
 * Genera y descarga una plantilla .xlsx de ejemplo.
 * @param {string[]} headers
 * @param {Array<string|number>} example fila de muestra
 */
async function downloadSheetTemplate(headers, example, sheetName, filename) {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers).font = { bold: true };
  sheet.addRow(example);
  sheet.columns.forEach((col, i) => { col.width = Math.min(Math.max(headers[i].length + 4, 14), 30); });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const QUOTE_COL_MAP = {
  folio: 'folio', 'tipo de servicio': 'serviceType', servicetype: 'serviceType',
  cliente: 'clientName', clientname: 'clientName', empresa: 'clientName',
  contacto: 'contactName', contactname: 'contactName',
  email: 'clientEmail', clientemail: 'clientEmail',
  telefono: 'clientPhone', phone: 'clientPhone',
  origen: 'origin', origin: 'origin',
  destino: 'destination', destination: 'destination',
  incoterm: 'incoterm',
  carrier: 'carrier', naviera: 'carrier',
  mercancia: 'commodity', commodity: 'commodity',
  'total usd': 'totalUSD', totalusd: 'totalUSD',
  notas: 'notes', notes: 'notes',
};

const SERVICE_MAP = {
  'maritimo fcl': 'maritimo_fcl', 'maritimo_fcl': 'maritimo_fcl', 'fcl': 'maritimo_fcl',
  'maritimo lcl': 'maritimo_lcl', 'maritimo_lcl': 'maritimo_lcl', 'lcl': 'maritimo_lcl',
  'aereo': 'aereo', 'aéreo': 'aereo',
  'terrestre full': 'terrestre_full', 'full': 'terrestre_full',
  'aduanal importacion': 'aduanal_importacion', 'aduanal_importacion': 'aduanal_importacion',
  'aduanal exportacion': 'aduanal_exportacion', 'aduanal_exportacion': 'aduanal_exportacion',
};

export default function ImportPage({ toast, onNavigate }) {
  const [importTab, setImportTab] = useState('leads'); // 'leads' | 'quotes'
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const fileRef = useRef();
  const pollRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await getJob(jobId);
        const job = r.data.data;
        setJobStatus(job);
        if (job.status === 'done' || job.status === 'failed') {
          clearInterval(pollRef.current);
          setImporting(false);
          if (job.status === 'done') {
            setResult(job.result || {});
            toast(`${job.result?.created || 0} leads importados`, 'success');
          } else {
            toast('Error en la importación', 'error');
          }
        }
      } catch { clearInterval(pollRef.current); setImporting(false); }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  const handleFile = async (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext)) {
      return toast('Solo se aceptan archivos .xlsx, .xls o .csv', 'error');
    }
    setFile(f);
    setResult(null);
    setErrors([]);
    try {
      const rows = await parseXLSX(f);
      setPreview(rows.slice(0, 5));
      if (rows.length === 0) toast('El archivo está vacío o no tiene columnas reconocidas', 'warning');
    } catch (err) {
      toast('Error al leer el archivo', 'error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseXLSX(file);
      if (!rows.length) return toast('No hay filas válidas para importar', 'error');

      // Validate
      const errs = [];
      rows.forEach((r, i) => {
        if (!r.company && !r.contact) errs.push(`Fila ${i + 2}: falta empresa o contacto`);
      });
      if (errs.length > 10) {
        setErrors(errs.slice(0, 10));
        setImporting(false);
        return toast(`${errs.length} errores de validación`, 'error');
      }

      const res = await importLeads({ leads: rows });
      const jid = res.data.data?.jobId;
      if (jid) {
        setJobId(jid);
        setJobStatus({ status: 'pending', total: rows.length });
        toast(`Importando ${rows.length} leads en segundo plano…`, 'info');
      } else {
        setResult(res.data.data || {});
        toast(`${res.data.data?.created || 0} leads importados`, 'success');
        setImporting(false);
      }
    } catch (e) {
      toast(e.response?.data?.message || 'Error al importar', 'error');
      setImporting(false);
    }
  };

  const downloadTemplate = () => downloadSheetTemplate(
    ['company','contact','email','phone','whatsapp','source','stage','country','value','notes','services'],
    ['ACME Corp','Juan Pérez','juan@acme.com','5551234567','5551234567','web','new','México','50000','Cliente potencial','maritimo'],
    'Leads', 'plantilla_importacion_leads.xlsx',
  ).catch(() => toast('No se pudo generar la plantilla', 'error'));

  const handleImportQuotes = async () => {
    if (!file) return;
    setImporting(true);
    try {
      // Se parsea directamente con el mapa de cotizaciones. Antes se usaba el
      // de leads y luego se intentaba traducir otra vez sobre claves ya
      // convertidas, así que ninguna columna casaba.
      const quotes = (await parseSheet(file, QUOTE_COL_MAP, (q) => q.clientName || q.folio))
        .map(q => ({
          ...q,
          serviceType: q.serviceType
            ? (SERVICE_MAP[q.serviceType.toLowerCase()] || 'maritimo_fcl')
            : 'maritimo_fcl',
        }));
      if (!quotes.length) return toast('No hay filas válidas para importar', 'error');
      const rows = quotes;

      let created = 0, errs = [];
      for (const q of quotes) {
        try { await createQuote(q); created++; }
        catch (e) { errs.push(`${q.folio || q.clientName}: ${e.response?.data?.message || e.message}`); }
      }

      setResult({ created, skipped: rows.length - quotes.length, errors: errs });
      toast(`${created} cotizaciones importadas`, 'success');
    } catch (e) { toast(e.response?.data?.message || 'Error al importar', 'error'); }
    finally { setImporting(false); }
  };

  const downloadQuoteTemplate = () => downloadSheetTemplate(
    ['folio','serviceType','clientName','contactName','clientEmail','clientPhone','origin','destination','incoterm','carrier','commodity','totalUSD','notes'],
    ['COT-2024-0001','maritimo_fcl','ACME Corp','Juan Pérez','juan@acme.com','5551234567','Shanghai','Manzanillo','FOB','Maersk','Autopartes','5000','Urgente'],
    'Cotizaciones', 'plantilla_importacion_cotizaciones.xlsx',
  ).catch(() => toast('No se pudo generar la plantilla', 'error'));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Importar desde Excel</h1>
          <p className="page-subtitle">Carga masiva de leads o cotizaciones desde archivo .xlsx o .csv</p>
        </div>
        <button className="btn btn-ghost" onClick={importTab === 'leads' ? downloadTemplate : downloadQuoteTemplate}>
          <Download size={15} /> Descargar plantilla {importTab === 'leads' ? 'leads' : 'cotizaciones'}
        </button>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[{ id: 'leads', label: '👥 Leads' }, { id: 'quotes', label: '📋 Cotizaciones' }].map(t => (
          <button key={t.id} onClick={() => { setImportTab(t.id); setFile(null); setPreview([]); setResult(null); setErrors([]); }}
            style={{ padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: importTab === t.id ? 700 : 400,
              borderBottom: importTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: importTab === t.id ? 'var(--primary)' : 'var(--text3)', fontSize: 13, marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 12,
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: file ? 'var(--surface2)' : 'var(--surface)',
          transition: 'background .2s',
          marginBottom: 24,
        }}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        <FileSpreadsheet size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
        {file ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{file.name}</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Haz clic para cambiar el archivo</div>
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Arrastra tu archivo aquí o haz clic para seleccionar</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Formatos: .xlsx, .xls, .csv</div>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="card" style={{ marginBottom: 20, overflowX: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Vista previa (primeras 5 filas)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {Object.keys(preview[0]).map(k => <th key={k} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text2)' }}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {Object.values(row).map((v, j) => <td key={j} style={{ padding: '6px 10px' }}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="card" style={{ marginBottom: 20, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)' }}>
          <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertCircle size={16} /> Errores de validación
          </div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>{e}</div>)}
        </div>
      )}

      {/* Job polling status */}
      {jobStatus && jobStatus.status !== 'done' && jobStatus.status !== 'failed' && (
        <div className="card" style={{ marginBottom: 20, background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.2)' }}>
          <div style={{ color: '#2563eb', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Clock size={16} /> Importando en segundo plano…
          </div>
          <div style={{ fontSize: 13, marginTop: 8, color: 'var(--text2)' }}>
            Procesando <strong>{jobStatus.total || 0}</strong> filas. Esto puede tardar unos segundos.
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card" style={{ marginBottom: 20, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)' }}>
          <div style={{ color: '#16a34a', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle size={16} /> Importación completada
          </div>
          <div style={{ fontSize: 13, marginTop: 8 }}>
            <strong>{result.created || 0}</strong> leads creados ·&nbsp;
            <strong>{result.skipped || 0}</strong> omitidos
            {result.errors?.length > 0 && (
              <span style={{ color: 'var(--red)', marginLeft: 8 }}>· <strong>{result.errors.length}</strong> errores</span>
            )}
          </div>
          {result.errors?.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--red)' }}>• {e}</div>
              ))}
            </div>
          )}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onNavigate(importTab === 'quotes' ? 'quoter' : 'leads')}>
            Ver {importTab === 'quotes' ? 'cotizaciones' : 'leads'} importados
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={importTab === 'leads' ? handleImport : handleImportQuotes}
          disabled={!file || importing}
        >
          {importing ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Importando...</> : <><Upload size={15} /> Importar {importTab === 'leads' ? 'leads' : 'cotizaciones'}</>}
        </button>
        {file && !importing && (
          <button className="btn btn-ghost" onClick={() => { setFile(null); setPreview([]); setResult(null); setErrors([]); }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Column mapping guide */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Columnas reconocidas automáticamente</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, fontSize: 13 }}>
          {Object.entries(COL_MAP).map(([alias, field]) => (
            <div key={alias} style={{ color: 'var(--text2)' }}>
              <code style={{ color: 'var(--orange-500)' }}>{alias}</code> → {field}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
