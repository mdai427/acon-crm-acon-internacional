import React, { useState, useEffect, useCallback } from 'react';
import { getTemplates2, createTemplate, updateTemplate, deleteTemplate } from '../services/api';
import { Plus, Edit2, Trash2, FileText, Copy, Zap, Mail, MessageSquare, Phone, ChevronDown, ChevronUp, CheckCircle, Save, X } from 'lucide-react';

// ── Stages ──────────────────────────────────────────────────
const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const STAGE_META = {
  new:         { label: 'Nuevo Lead',     color: '#6366F1', bg: '#6366F114', emoji: '🆕' },
  contacted:   { label: 'Contactado',     color: '#F59E0B', bg: '#F59E0B14', emoji: '📞' },
  qualified:   { label: 'Calificado',     color: '#0EA5E9', bg: '#0EA5E914', emoji: '✅' },
  proposal:    { label: 'Propuesta',      color: '#F2641E', bg: '#F2641E14', emoji: '📄' },
  negotiation: { label: 'Negociación',    color: '#7C3AED', bg: '#7C3AED14', emoji: '🤝' },
  closed_won:  { label: 'Ganado',         color: '#16A34A', bg: '#16A34A14', emoji: '🏆' },
  closed_lost: { label: 'Perdido',        color: '#9AA3AE', bg: '#9AA3AE14', emoji: '❌' },
};
const CHANNEL_META = {
  whatsapp:    { label: 'WhatsApp', Icon: MessageSquare, color: '#25D366' },
  email:       { label: 'Email',    Icon: Mail,          color: '#2563EB' },
  call_script: { label: 'Llamada',  Icon: Phone,         color: '#7C3AED' },
};

// ── Seed templates (Freight Forwarding / ACON Internacional) ─
const SEED_TEMPLATES = [
  // ── NEW ────────────────────────────────────────────────────
  {
    name: 'Primer contacto WhatsApp — Nuevo lead',
    stage: 'new', channel: 'whatsapp', subject: '',
    body: `¡Hola {{nombre}}! 👋

Soy {{ejecutivo}} de *ACON Internacional*, empresa especializada en Freight Forwarding con más de 20 años conectando México con el mundo.

Vi que tu empresa *{{empresa}}* podría beneficiarse de nuestras soluciones logísticas. Trabajamos con:
🚢 Flete Marítimo (Importación / Exportación)
✈️ Flete Aéreo Internacional
🚛 Transporte Terrestre USA/México
📋 Despacho Aduanal

¿Tienes 10 minutos esta semana para explorar cómo podemos optimizar tu cadena de suministro? 🗓️`,
  },
  {
    name: 'Primer contacto Email — Nuevo lead',
    stage: 'new', channel: 'email',
    subject: 'Soluciones de Freight Forwarding para {{empresa}} | ACON Internacional',
    body: `Estimado/a {{nombre}},

Mi nombre es {{ejecutivo}} y me desempeño como Ejecutivo de Negocios en ACON Internacional, empresa líder en Freight Forwarding con presencia en los principales puertos y aeropuertos de México.

Nos especializamos en:
• Importación y exportación marítima (FCL / LCL)
• Flete aéreo express e internacional
• Transporte terrestre México – EE.UU. – Canadá
• Despacho aduanal y cumplimiento normativo
• Seguros de carga y almacenaje

Me gustaría conocer las necesidades logísticas de {{empresa}} y presentarles una propuesta personalizada que optimice tiempos y costos en su cadena de suministro.

¿Podríamos agendar una llamada de 15 minutos esta semana?

Quedo a sus órdenes,
{{ejecutivo}}
ACON Internacional
📱 {{telefono}} | ✉️ {{email_ejecutivo}}`,
  },
  {
    name: 'Script de llamada — Prospección fría',
    stage: 'new', channel: 'call_script', subject: '',
    body: `SCRIPT: LLAMADA DE PROSPECCIÓN FRÍA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INTRODUCCIÓN (0:00 – 0:30)
"Buenos días/tardes, ¿me comunico con {{nombre}} de {{empresa}}?
Mi nombre es {{ejecutivo}} de ACON Internacional. ¿Le interrumpo en un mal momento?"

[Si dice SÍ → "¿Cuándo sería mejor llamarle?" → agendar]
[Si dice NO → continuar]

GANCHO (0:30 – 1:00)
"Llamo porque nos especializamos en soluciones de Freight Forwarding para empresas como {{empresa}} que operan [importando/exportando] desde/hacia [país/región]. Trabajamos con empresas del sector {{industria}} reduciendo hasta un 18% sus costos logísticos."

PREGUNTA DE CALIFICACIÓN (1:00 – 2:30)
• "¿Actualmente cómo manejan sus embarques internacionales?"
• "¿Trabajan con algún agente aduanal o freight forwarder?"
• "¿Cuál es el principal dolor que tienen en su logística actual?"
• "¿Cuántos embarques manejan aproximadamente al mes?"

PROPUESTA DE VALOR (2:30 – 3:30)
"Entiendo. En ACON podríamos ayudarles con [solución específica] — gestionamos todo: booking, documentación, aduanas y entrega. Todo con un ejecutivo dedicado."

CIERRE (3:30 – 4:00)
"¿Le parece si agendamos 20 minutos para que yo o uno de nuestros especialistas les presenten una cotización sin compromiso?"

→ CONFIRMAR: Fecha / Hora / Email para enviar invitación`,
  },

  // ── CONTACTED ──────────────────────────────────────────────
  {
    name: 'Follow-up 48h — WhatsApp',
    stage: 'contacted', channel: 'whatsapp', subject: '',
    body: `¡Hola {{nombre}}! 😊

Soy {{ejecutivo}} de ACON Internacional, te contacté hace un par de días.

Quería retomar el tema de sus operaciones de {{servicio}} — tenemos una propuesta muy competitiva preparada para {{empresa}}.

¿Tienes 10 minutos esta semana? Te puedo mostrar cómo hemos ayudado a otras empresas del sector a reducir sus tiempos de tránsito. 🚢✈️

¡Quedo pendiente! 🙌`,
  },
  {
    name: 'Follow-up 72h — Email',
    stage: 'contacted', channel: 'email',
    subject: 'Seguimiento: Soluciones logísticas para {{empresa}}',
    body: `Hola {{nombre}},

Me permito hacer seguimiento a mi mensaje anterior. Sé que el tiempo es valioso, por eso quiero ir directo al punto:

En ACON Internacional podemos ayudar a {{empresa}} a:
✅ Reducir costos de flete hasta un 15-20%
✅ Acortar tiempos de tránsito con rutas optimizadas
✅ Eliminar problemas aduanales con nuestro equipo especializado
✅ Visibilidad en tiempo real de sus embarques

¿Le interesaría recibir una cotización sin compromiso para su próxima operación?

Solo necesito saber:
• Origen y destino
• Tipo de mercancía
• Volumen aproximado (peso/CBM)

Estoy disponible para una llamada de 15 minutos esta semana.

Saludos,
{{ejecutivo}}`,
  },
  {
    name: 'Script — Segunda llamada de seguimiento',
    stage: 'contacted', channel: 'call_script', subject: '',
    body: `SCRIPT: SEGUNDA LLAMADA / SEGUIMIENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INTRODUCCIÓN
"Hola {{nombre}}, habla {{ejecutivo}} de ACON Internacional. Le contacté la semana pasada — ¿cómo ha estado?"

RECORDATORIO
"Quería darle seguimiento porque quedé en enviarle información sobre nuestras soluciones para [importación/exportación]. ¿Tuvo oportunidad de revisarla?"

[Si la revisó → "¿Qué le pareció? ¿Tiene alguna pregunta?"]
[Si no la revisó → "No hay problema. En dos palabras: somos un freight forwarder con más de 20 años..."]

MANEJO DE OBJECIONES:
• "Ya tenemos proveedor" → "Entiendo perfectamente. ¿Me permitiría hacerle una cotización comparativa? Muchos de nuestros clientes actuales tenían proveedor antes de trabajar con nosotros."
• "No es el momento" → "¿Cuándo sería mejor momento? ¿Puedo llamarle en [mes]?"
• "Mándeme información" → "Con gusto. Para enviarle algo útil, ¿me permite una pregunta rápida sobre sus operaciones?"

CIERRE
"¿Le parece si agendamos una videollamada de 20 minutos para presentarle nuestra propuesta de valor? Le preparo un análisis específico para {{empresa}}."`,
  },

  // ── QUALIFIED ──────────────────────────────────────────────
  {
    name: 'Lead calificado — Confirmar necesidades',
    stage: 'qualified', channel: 'email',
    subject: 'Próximos pasos — Propuesta ACON para {{empresa}}',
    body: `Estimado/a {{nombre}},

Fue un placer conversar hoy. Conforme lo que platicamos, entiendo que {{empresa}} necesita:

📌 Servicio: {{servicio}}
📌 Ruta: {{origen}} → {{destino}}
📌 Frecuencia: {{frecuencia}} embarques/mes
📌 Tipo de carga: {{tipo_carga}}

Con base en esta información, nuestro equipo de especialistas preparará una propuesta personalizada que incluirá:
• Cotización detallada con comparativa de rutas
• Tiempos de tránsito estimados
• Condiciones de servicio y SLAs
• Referencias de clientes similares

Le enviamos la propuesta a más tardar el próximo {{fecha_propuesta}}.

¿Hay algún detalle adicional que deba considerar para la cotización?

Con gusto quedo disponible para cualquier pregunta.

{{ejecutivo}}
ACON Internacional`,
  },
  {
    name: 'Lead calificado — WhatsApp post-reunión',
    stage: 'qualified', channel: 'whatsapp', subject: '',
    body: `¡Hola {{nombre}}! 👋

Gracias por tu tiempo hoy. Fue excelente conocer más sobre las operaciones de {{empresa}}.

*Resumen de lo acordado:*
📦 Servicio: {{servicio}}
🗺️ Ruta: {{origen}} → {{destino}}
📅 Propuesta lista: {{fecha_propuesta}}

Me pondré manos a la obra para prepararte la cotización más competitiva. Si tienes alguna pregunta mientras tanto, escríbeme aquí. 😊

¡Hablamos pronto! 🚢`,
  },

  // ── PROPOSAL ───────────────────────────────────────────────
  {
    name: 'Envío de propuesta comercial — Email',
    stage: 'proposal', channel: 'email',
    subject: 'Propuesta Comercial ACON Internacional — {{empresa}} | {{servicio}}',
    body: `Estimado/a {{nombre}},

Adjunto encontrará la propuesta comercial que preparamos especialmente para {{empresa}}, basada en los requerimientos que compartió en nuestra reunión.

📋 *RESUMEN EJECUTIVO DE LA PROPUESTA:*

• Servicio: {{servicio}}
• Ruta: {{origen}} → {{destino}}
• Tarifa: [Ver documento adjunto]
• Tiempo de tránsito estimado: {{dias_transito}} días hábiles
• Validez de la tarifa: 30 días naturales

*¿Por qué ACON Internacional?*
✅ +20 años de experiencia en comercio exterior
✅ Agente aduanal certificado A (máxima categoría SAT)
✅ Red de agentes en +80 países
✅ Ejecutivo dedicado con disponibilidad 24/7
✅ Sistema de tracking en tiempo real
✅ Garantía de cumplimiento documentario

Le propongo agendar una llamada de 30 minutos para revisar la propuesta juntos y resolver cualquier duda.

¿Le queda bien el {{fecha_reunion}}?

Atentamente,
{{ejecutivo}}
ACON Internacional
📱 {{telefono}}`,
  },
  {
    name: 'Propuesta enviada — WhatsApp',
    stage: 'proposal', channel: 'whatsapp', subject: '',
    body: `¡Hola {{nombre}}! 📄

Acabo de enviarte por correo la propuesta comercial para {{empresa}}.

*Puntos clave:*
🚢 Servicio: {{servicio}}
💰 Tarifa competitiva (válida 30 días)
⏱️ Tiempo de tránsito: {{dias_transito}} días
✅ Incluye despacho aduanal

¿Pudiste revisarla? Me encantaría hacer una llamada rápida para explicarte los detalles y resolver dudas. 📞

¿Cuándo tienes 20 minutos esta semana? 🗓️`,
  },
  {
    name: 'Follow-up propuesta — 5 días sin respuesta',
    stage: 'proposal', channel: 'email',
    subject: 'Re: Propuesta Comercial ACON — ¿Alguna pregunta, {{nombre}}?',
    body: `Hola {{nombre}},

Espero que te encuentres bien. Me permito hacer seguimiento a la propuesta que envié el {{fecha_propuesta}} para {{empresa}}.

Entiendo que tienes una agenda ocupada, por eso quiero preguntarte directamente:

¿Hay algún aspecto de la propuesta que podamos ajustar o aclarar?

Algunas preguntas que suelen surgir:
• Tiempos de tránsito → podemos explorar rutas alternativas
• Precio → existen opciones con diferentes niveles de servicio
• Condiciones de pago → tenemos esquemas flexibles
• Documentación requerida → nuestro equipo aduanal lo guía paso a paso

Si en este momento no es prioridad, dímelo con confianza — podemos retomar cuando tengas un embarque próximo.

¿Hablamos esta semana?

{{ejecutivo}}`,
  },

  // ── NEGOTIATION ────────────────────────────────────────────
  {
    name: 'Contraoferta / Ajuste de tarifa — Email',
    stage: 'negotiation', channel: 'email',
    subject: 'Propuesta Revisada — {{empresa}} | ACON Internacional',
    body: `Estimado/a {{nombre}},

Gracias por compartir sus comentarios sobre nuestra propuesta. Valoramos mucho la oportunidad de trabajar con {{empresa}} y hemos revisado internamente las condiciones.

*PROPUESTA AJUSTADA:*

Después de analizar el volumen y la ruta de sus operaciones, podemos ofrecerle:
✅ Tarifa revisada: [Nueva tarifa]
✅ Condición: Mínimo {{min_embarques}} embarques/mes o compromiso de {{duracion}} meses
✅ Beneficio adicional: {{beneficio_extra}} (almacenaje gratuito / seguro incluido / precio bloqueado)

Esta propuesta representa nuestro mejor esfuerzo considerando el potencial de crecimiento conjunto.

Para proceder, solo necesitaríamos:
1. Confirmación de aceptación por email
2. Datos fiscales para elaborar contrato de servicio
3. Detalles del primer embarque

¿Podemos confirmar esta semana para comenzar con el primer embarque?

{{ejecutivo}}
ACON Internacional`,
  },
  {
    name: 'Cierre suave en negociación — WhatsApp',
    stage: 'negotiation', channel: 'whatsapp', subject: '',
    body: `¡Hola {{nombre}}! 🤝

Quería darte seguimiento a nuestra última plática sobre la propuesta para {{empresa}}.

Revisamos internamente y podemos mejorar las condiciones si confirmamos antes del {{fecha_limite}}. 📅

¿Tienes 15 minutos hoy o mañana para cerrar los detalles y que podamos arrancar con tu primer embarque? 🚢

¡Queremos ser tu aliado logístico de confianza! 💪`,
  },
  {
    name: 'Script — Llamada de cierre',
    stage: 'negotiation', channel: 'call_script', subject: '',
    body: `SCRIPT: LLAMADA DE CIERRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

APERTURA
"{{nombre}}, buenos días. Habla {{ejecutivo}} de ACON. Llamo para darle seguimiento a nuestra propuesta y ver cómo podemos hacer que esto funcione para {{empresa}}."

CHEQUEO DE OBJECIONES PENDIENTES
"¿Tuvo oportunidad de revisar el ajuste que le enviamos? ¿Hay algo específico que nos esté impidiendo avanzar?"

MANEJO DE OBJECIONES COMUNES:

Precio alto:
"Entiendo. Permítame preguntarle: ¿cuánto está pagando actualmente? Me gustaría ver si hay espacio para optimizar. Muchos clientes nuestros pensaban que era caro hasta que vieron el costo total incluyendo demoras y errores aduanales."

Necesitan aprobación interna:
"¿Quién más está involucrado en la decisión? ¿Podría incluirlos en nuestra próxima llamada para presentarles el ROI del servicio?"

Quieren comparar cotizaciones:
"Es completamente válido. ¿Qué aspectos son más importantes para ustedes: precio, tiempo de tránsito o soporte? Así sé en qué enfocarnos para que la comparación sea justa."

CIERRE
"{{nombre}}, si resolvemos [objeción principal], ¿están en posición de confirmar esta semana?"
"¿Qué necesitan de mi parte para tomar la decisión?"

SIGUIENTE PASO
→ Agendar fecha de inicio del primer embarque
→ Solicitar datos fiscales para contrato`,
  },

  // ── CLOSED_WON ─────────────────────────────────────────────
  {
    name: 'Bienvenida cliente nuevo — Email',
    stage: 'closed_won', channel: 'email',
    subject: '¡Bienvenido a ACON Internacional, {{empresa}}! 🎉',
    body: `Estimado/a {{nombre}},

¡Estamos muy emocionados de darles la bienvenida a la familia ACON Internacional!

Quiero confirmar que todo está listo para iniciar con su primer embarque y presentarles cómo funcionará nuestra relación de trabajo:

👤 *SU EQUIPO ACON:*
• Ejecutivo de cuenta: {{ejecutivo}} ({{telefono}})
• Agente Aduanal: [Asignado]
• Coordinador de Tráfico: [Asignado]

📋 *PRÓXIMOS PASOS:*
1. Le enviaremos el contrato de servicio para firma electrónica
2. Les compartiremos acceso a nuestro portal de tracking
3. Coordinaremos los detalles del primer embarque

🔔 *COMPROMISOS ACON:*
✅ Respuesta en máximo 2 horas hábiles
✅ Actualización de status en cada hito del embarque
✅ Despacho aduanal sin errores garantizado
✅ Reporte mensual de operaciones

Gracias por confiar en ACON Internacional. ¡Vamos a hacer grandes cosas juntos! 🚢✈️

{{ejecutivo}}
ACON Internacional`,
  },
  {
    name: 'Bienvenida cliente — WhatsApp',
    stage: 'closed_won', channel: 'whatsapp', subject: '',
    body: `¡Felicitaciones {{nombre}} y bienvenido a *ACON Internacional*! 🎉🚢

Estamos muy contentos de tenerlos como clientes. Soy {{ejecutivo}}, tu ejecutivo de cuenta dedicado.

*¿Qué sigue?*
1️⃣ Te envío contrato por email
2️⃣ Te doy acceso al portal de tracking
3️⃣ Coordinamos tu primer embarque

Este será mi número directo para cualquier cosa que necesites. ¡Vamos a llevar las operaciones de {{empresa}} al siguiente nivel! 💪

¡Bienvenido a bordo! ⚓`,
  },

  // ── CLOSED_LOST ────────────────────────────────────────────
  {
    name: 'Cierre de ciclo con puerta abierta — Email',
    stage: 'closed_lost', channel: 'email',
    subject: 'Hasta pronto, {{nombre}} — ACON Internacional siempre a sus órdenes',
    body: `Estimado/a {{nombre}},

Entiendo perfectamente su decisión y la respeto. Aunque en esta ocasión no pudimos concretar una colaboración, quiero que sepa que en ACON Internacional quedamos a sus órdenes para cuando lo necesiten.

Las condiciones del mercado cambian — fletes, rutas, proveedores — y si en algún momento desean una segunda opinión o comparar opciones, estaremos aquí.

Me gustaría pedirle un favor: ¿podría compartirme brevemente qué factor fue determinante en su decisión? Su retroalimentación nos ayuda a mejorar continuamente.

Sin otro particular, le deseo mucho éxito en sus operaciones y espero que podamos colaborar en el futuro.

Quedo a sus órdenes,
{{ejecutivo}}
ACON Internacional
📱 {{telefono}}

PD: Le mantendré en nuestra lista de contactos para compartirle actualizaciones de tarifas y noticias del sector que puedan ser de utilidad.`,
  },
  {
    name: 'Reactivación 3 meses — WhatsApp',
    stage: 'closed_lost', channel: 'whatsapp', subject: '',
    body: `¡Hola {{nombre}}! Espero que todo esté muy bien en {{empresa}}. 👋

Soy {{ejecutivo}} de ACON Internacional — platicamos hace unos meses sobre sus operaciones logísticas.

Quería avisarte que tenemos *nuevas tarifas marítimas* desde/hacia Asia y EE.UU. con muy buenos tiempos de tránsito. 🚢

¿Estarías abierto a una cotización rápida para su próximo embarque? Sin compromiso, en menos de 24 horas. ⚡

¡Quedo pendiente! 😊`,
  },
];

const emptyForm = { name: '', stage: 'new', channel: 'whatsapp', subject: '', body: '' };

export default function TemplatesPage({ toast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [stageFilter, setStageFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  // Inline preview expand
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (stageFilter) params.stage = stageFilter;
      if (channelFilter) params.channel = channelFilter;
      const r = await getTemplates2(params);
      setTemplates(r.data.data || []);
    } catch { toast('Error al cargar plantillas', 'error'); }
    finally { setLoading(false); }
  }, [stageFilter, channelFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      let count = 0;
      for (const t of SEED_TEMPLATES) {
        await createTemplate(t);
        count++;
      }
      toast(`✅ ${count} plantillas ACON creadas`, 'success');
      load();
    } catch { toast('Error al crear plantillas', 'error'); }
    finally { setSeeding(false); }
  };

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (t) => {
    setForm({ name: t.name, stage: t.stage, channel: t.channel, subject: t.subject || '', body: t.body });
    setEditId(t._id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.body) return toast('Nombre y cuerpo son requeridos', 'error');
    try {
      if (editId) { await updateTemplate(editId, form); toast('Plantilla guardada', 'success'); }
      else { await createTemplate(form); toast('Plantilla creada', 'success'); }
      setShowModal(false);
      load();
    } catch (e) { toast(e.response?.data?.message || 'Error al guardar', 'error'); }
  };

  const handleDelete = async (id) => {
    try { await deleteTemplate(id); toast('Plantilla eliminada', 'success'); setConfirmDelete(null); load(); }
    catch { toast('Error al eliminar', 'error'); }
  };

  const handleCopy = (body) => {
    navigator.clipboard?.writeText(body).catch(() => {});
    toast('Copiado al portapapeles', 'success');
  };

  // Filter by search
  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.body.toLowerCase().includes(search.toLowerCase())
  );

  // Group by stage
  const grouped = STAGES.reduce((acc, s) => {
    const items = filtered.filter(t => t.stage === s);
    if (items.length > 0) acc[s] = items;
    return acc;
  }, {});

  const totalByStage = STAGES.reduce((acc, s) => {
    acc[s] = templates.filter(t => t.stage === s).length;
    return acc;
  }, {});

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Plantillas de Comunicación</div>
          <div className="page-sub">Mensajes listos por etapa del prospecto — WhatsApp, Email y Script de Llamada</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {templates.length === 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleSeed} disabled={seeding}
              style={{ display: 'flex', alignItems: 'center', gap: 5, borderColor: '#F2641E', color: '#F2641E' }}>
              <Zap size={13} /> {seeding ? 'Cargando...' : 'Cargar plantillas ACON'}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Nueva Plantilla
          </button>
        </div>
      </div>

      {/* Stage pills — count summary */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={() => setStageFilter('')} style={{
          padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: !stageFilter ? '#0B2545' : '#fff', color: !stageFilter ? '#fff' : '#5A6472', borderColor: !stageFilter ? '#0B2545' : '#E3E6EA',
        }}>
          Todas ({templates.length})
        </button>
        {STAGES.map(s => {
          const m = STAGE_META[s];
          const active = stageFilter === s;
          return (
            <button key={s} onClick={() => setStageFilter(active ? '' : s)} style={{
              padding: '5px 14px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: active ? m.color : '#fff', color: active ? '#fff' : '#5A6472',
              borderColor: active ? m.color : '#E3E6EA',
            }}>
              {m.emoji} {m.label} {totalByStage[s] > 0 && `(${totalByStage[s]})`}
            </button>
          );
        })}
      </div>

      {/* Search + channel filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          className="form-input" placeholder="Buscar plantilla..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 320 }}
        />
        <select className="form-select" value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los canales</option>
          {Object.entries(CHANNEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /> Cargando plantillas...</div>
      ) : templates.length === 0 ? (
        /* Empty state with CTA */
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <FileText size={48} color="#9AA3AE" style={{ marginBottom: 16 }} />
          <div style={{ fontWeight: 700, fontSize: 16, color: '#0B2545', marginBottom: 8 }}>No hay plantillas todavía</div>
          <div style={{ color: '#9AA3AE', fontSize: 13, marginBottom: 24 }}>Carga las plantillas profesionales de ACON o crea la tuya desde cero.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={handleSeed} disabled={seeding} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={15} /> {seeding ? 'Creando...' : 'Cargar plantillas ACON (16)'}
            </button>
            <button className="btn btn-ghost" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Crear desde cero
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9AA3AE' }}>No hay plantillas con ese filtro.</div>
      ) : (
        /* Grouped by stage */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {Object.entries(grouped).map(([stage, items]) => {
            const m = STAGE_META[stage];
            return (
              <div key={stage}>
                {/* Stage header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{m.emoji}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0B2545' }}>{m.label}</div>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: m.color, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{items.length}</div>
                  <div style={{ flex: 1, height: 1, background: '#F0F1F3' }} />
                </div>

                {/* Template cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                  {items.map(t => {
                    const ch = CHANNEL_META[t.channel] || {};
                    const isExpanded = expandedId === t._id;
                    return (
                      <div key={t._id} className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${isExpanded ? m.color + '40' : '#E3E6EA'}` }}>
                        {/* Card top stripe */}
                        <div style={{ height: 3, background: m.color }} />
                        <div style={{ padding: '14px 16px' }}>
                          {/* Title + channel badge */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#0B2545', lineHeight: 1.3, marginBottom: 6 }}>{t.name}</div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 700, background: m.bg, color: m.color }}>
                                  {m.emoji} {m.label}
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 700, background: `${ch.color}14`, color: ch.color }}>
                                  {ch.Icon && <ch.Icon size={9} />} {ch.label}
                                </span>
                              </div>
                            </div>
                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                              <button title="Copiar" onClick={() => handleCopy(t.body)} style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9AA3AE', borderRadius: 6 }} onMouseEnter={e => e.target.style.background = '#F4F5F7'} onMouseLeave={e => e.target.style.background = 'transparent'}>
                                <Copy size={13} />
                              </button>
                              <button title="Editar" onClick={() => openEdit(t)} style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9AA3AE', borderRadius: 6 }} onMouseEnter={e => e.target.style.background = '#F4F5F7'} onMouseLeave={e => e.target.style.background = 'transparent'}>
                                <Edit2 size={13} />
                              </button>
                              <button title="Eliminar" onClick={() => setConfirmDelete(t._id)} style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC262640', borderRadius: 6 }} onMouseEnter={e => { e.target.style.background = '#FEF2F2'; e.target.style.color = '#DC2626'; }} onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = '#DC262640'; }}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Subject (email) */}
                          {t.subject && (
                            <div style={{ fontSize: 11, color: '#5A6472', marginBottom: 6, padding: '4px 8px', background: '#F4F5F7', borderRadius: 6 }}>
                              <strong>Asunto:</strong> {t.subject}
                            </div>
                          )}

                          {/* Preview */}
                          <div style={{ fontSize: 12, color: '#5A6472', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: isExpanded ? 'none' : 72, overflow: 'hidden', position: 'relative' }}>
                            {t.body}
                            {!isExpanded && t.body.length > 120 && (
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: 'linear-gradient(transparent, #fff)' }} />
                            )}
                          </div>

                          {/* Expand toggle */}
                          <button onClick={() => setExpandedId(isExpanded ? null : t._id)}
                            style={{ marginTop: 8, fontSize: 11, color: m.color, fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>
                            {isExpanded ? <><ChevronUp size={12} /> Ver menos</> : <><ChevronDown size={12} /> Ver completo</>}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit / Create Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #F0F1F3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#0B2545' }}>{editId ? 'Editar plantilla' : 'Nueva plantilla'}</div>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9AA3AE', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nombre de la plantilla</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Ej. Primer contacto WhatsApp" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Etapa del prospecto</label>
                  <select className="form-select" value={form.stage} onChange={e => setForm(f => ({...f, stage: e.target.value}))}>
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_META[s].emoji} {STAGE_META[s].label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Canal</label>
                  <select className="form-select" value={form.channel} onChange={e => setForm(f => ({...f, channel: e.target.value}))}>
                    {Object.entries(CHANNEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {form.channel === 'email' && (
                <div className="form-group">
                  <label className="form-label">Asunto del correo</label>
                  <input className="form-input" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Ej. Propuesta logística para {{empresa}}" />
                </div>
              )}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Contenido</span>
                  <span style={{ fontSize: 11, color: '#9AA3AE', fontWeight: 400 }}>
                    Variables: <code style={{ background: '#F4F5F7', padding: '1px 5px', borderRadius: 4 }}>{'{{nombre}}'}</code> <code style={{ background: '#F4F5F7', padding: '1px 5px', borderRadius: 4 }}>{'{{empresa}}'}</code> <code style={{ background: '#F4F5F7', padding: '1px 5px', borderRadius: 4 }}>{'{{ejecutivo}}'}</code> <code style={{ background: '#F4F5F7', padding: '1px 5px', borderRadius: 4 }}>{'{{servicio}}'}</code>
                  </span>
                </label>
                <textarea className="form-input" rows={10} value={form.body} onChange={e => setForm(f => ({...f, body: e.target.value}))}
                  placeholder="Escribe el mensaje aquí. Usa {{nombre}}, {{empresa}}, {{ejecutivo}}, {{servicio}}, {{origen}}, {{destino}}..."
                  style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }} />
                <div style={{ fontSize: 11, color: '#9AA3AE', marginTop: 4 }}>{form.body.length} caracteres</div>
              </div>
            </div>
            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F0F1F3', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Save size={14} /> {editId ? 'Guardar cambios' : 'Crear plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}
          onClick={() => setConfirmDelete(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 380, width: '90%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <Trash2 size={32} color="#DC2626" style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 700, fontSize: 16, color: '#0B2545', marginBottom: 8 }}>¿Eliminar plantilla?</div>
            <div style={{ color: '#9AA3AE', fontSize: 13, marginBottom: 24 }}>Esta acción no se puede deshacer.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => handleDelete(confirmDelete)} style={{ background: '#DC2626', borderColor: '#DC2626' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
