import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { importLeads } from '../services/api';

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

export default function ImportPage({ toast, onNavigate }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const fileRef = useRef();

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
      setResult(res.data);
      toast(`${res.data.data?.created || 0} leads importados`, 'success');
    } catch (e) {
      toast(e.response?.data?.message || 'Error al importar', 'error');
    } finally {
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Importar Leads desde Excel</h1>
          <p className="page-subtitle">Carga masiva de leads desde archivo .xlsx o .csv</p>
        </div>
        <button className="btn btn-ghost" onClick={downloadTemplate}>
          <Download size={15} /> Descargar plantilla
        </button>
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

      {/* Result */}
      {result && (
        <div className="card" style={{ marginBottom: 20, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)' }}>
          <div style={{ color: '#16a34a', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle size={16} /> Importación completada
          </div>
          <div style={{ fontSize: 13, marginTop: 8 }}>
            <strong>{result.data?.created || 0}</strong> leads creados ·&nbsp;
            <strong>{result.data?.skipped || 0}</strong> omitidos
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onNavigate('leads')}>
            Ver leads importados
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={!file || importing}
        >
          {importing ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Importando...</> : <><Upload size={15} /> Importar leads</>}
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
