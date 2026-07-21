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

function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // Dynamic import of xlsx
        import('xlsx').then(XLSX => {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (!raw.length) return resolve([]);

          const rows = raw.map(row => {
            const out = {};
            Object.entries(row).forEach(([k, v]) => {
              const key = COL_MAP[k.toLowerCase().trim()];
              if (key) out[key] = String(v).trim();
            });
            return out;
          }).filter(r => r.company || r.contact);

          resolve(rows);
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
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

  const downloadTemplate = () => {
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['company','contact','email','phone','whatsapp','source','stage','country','value','notes','services'],
        ['ACME Corp','Juan Pérez','juan@acme.com','5551234567','5551234567','web','new','México','50000','Cliente potencial','maritimo'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');
      XLSX.writeFile(wb, 'plantilla_importacion_leads.xlsx');
    });
  };

  const handleImportQuotes = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseXLSX(file);
      if (!rows.length) return toast('No hay filas válidas para importar', 'error');

      // Map columns
      const quotes = rows.map(raw => {
        const q = {};
        Object.entries(raw).forEach(([k, v]) => {
          const key = QUOTE_COL_MAP[k.toLowerCase().trim()];
          if (key) q[key] = String(v).trim();
        });
        // Normalize serviceType
        if (q.serviceType) q.serviceType = SERVICE_MAP[q.serviceType.toLowerCase()] || 'maritimo_fcl';
        if (!q.serviceType) q.serviceType = 'maritimo_fcl';
        return q;
      }).filter(q => q.clientName || q.folio);

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

  const downloadQuoteTemplate = () => {
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['folio','serviceType','clientName','contactName','clientEmail','clientPhone','origin','destination','incoterm','carrier','commodity','totalUSD','notes'],
        ['COT-2024-0001','maritimo_fcl','ACME Corp','Juan Pérez','juan@acme.com','5551234567','Shanghai','Manzanillo','FOB','Maersk','Autopartes','5000','Urgente'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cotizaciones');
      XLSX.writeFile(wb, 'plantilla_importacion_cotizaciones.xlsx');
    });
  };

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
