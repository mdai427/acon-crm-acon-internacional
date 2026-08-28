import React, { useState } from 'react';
import { Plus, Zap, Clock, GitBranch, Split, LogOut, StickyNote, MessageSquare, Mail, CheckSquare, Bell, Sparkles, ArrowRightCircle, UserPlus, Tag, Edit3, Repeat, AlertCircle } from 'lucide-react';
import { NODE_META, GROUPS, handlesOf, HANDLE_LABELS, nextOf, nodeById, summarize, describeTrigger } from './flowUtils';

const ICONS = {
  trigger: Zap, wait: Clock, condition: GitBranch, split: Split, exit: LogOut, note: StickyNote,
  send_whatsapp: MessageSquare, send_email: Mail, create_task: CheckSquare, notify: Bell, ai_email_draft: Sparkles,
  change_stage: ArrowRightCircle, assign: UserPlus, tag: Tag, update_field: Edit3, enroll_flow: Repeat,
};

// Lienzo vertical: dibuja el árbol desde `start` siguiendo las aristas. Los nodos con varias
// salidas abren columnas (una por salida). Cada salida termina en un «+» para insertar pasos.

function AddMenu({ onPick, onClose }) {
  return (
    <div className="fl-addmenu" onMouseLeave={onClose}>
      {GROUPS.map(g => (
        <div key={g.id}>
          <div className="fl-addmenu-group">{g.label}</div>
          {Object.entries(NODE_META).filter(([t, m]) => m.group === g.id && t !== 'trigger').map(([t, m]) => {
            const Icon = ICONS[t];
            return <button key={t} type="button" onClick={() => onPick(t)}><Icon size={14} /> {m.label}</button>;
          })}
        </div>
      ))}
    </div>
  );
}

function AddButton({ onAdd, readOnly }) {
  const [open, setOpen] = useState(false);
  if (readOnly) return <div className="fl-end" />;
  return (
    <div className="fl-add">
      <button type="button" className="fl-add-btn" onClick={() => setOpen(o => !o)} title="Añadir paso"><Plus size={14} /></button>
      {open && <AddMenu onPick={t => { setOpen(false); onAdd(t); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NodeCard({ node, flow, ctx, selected, hasError, hit, onSelect }) {
  const Icon = ICONS[node.type] || Zap;
  const meta = NODE_META[node.type] || {};
  const isTrigger = node.type === 'trigger';
  const summary = isTrigger ? describeTrigger(flow.trigger, ctx) : summarize(node, ctx);
  return (
    <button type="button" className={`fl-node fl-node-${meta.color || 'gray'}${selected ? ' is-selected' : ''}${hasError ? ' has-error' : ''}${hit ? ' is-hit' : ''}`} onClick={() => onSelect(node.id)}>
      <span className="fl-node-icon"><Icon size={15} /></span>
      <span className="fl-node-text">
        <span className="fl-node-label">{isTrigger ? 'Disparador' : (node.label || meta.label)}</span>
        <span className="fl-node-summary">{summary}</span>
      </span>
      {hasError && <AlertCircle size={14} className="fl-node-alert" />}
    </button>
  );
}

function Branch({ flow, fromId, handle, ctx, selectedId, errorIds, hitIds, onSelect, onAdd, readOnly }) {
  const chain = [];
  let cur = nextOf(flow, fromId, handle);
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = nodeById(flow, cur);
    if (!node) break;
    chain.push(node);
    const hs = handlesOf(node);
    if (hs.length !== 1) break; // ramifica o termina: lo dibuja el propio nodo
    cur = nextOf(flow, cur, hs[0]);
  }
  const last = chain[chain.length - 1];
  const lastHandles = last ? handlesOf(last) : [];
  const branches = last && lastHandles.length > 1;
  const terminal = last && lastHandles.length === 0;
  return (
    <div className="fl-branch">
      {chain.map(node => (
        <React.Fragment key={node.id}>
          <div className="fl-link" />
          <NodeCard node={node} flow={flow} ctx={ctx} selected={selectedId === node.id} hasError={errorIds.has(node.id)} hit={hitIds.has(node.id)} onSelect={onSelect} />
        </React.Fragment>
      ))}
      {branches ? (
        <div className="fl-fork">
          {lastHandles.map(h => (
            <div className="fl-fork-col" key={h}>
              <div className="fl-fork-label">{HANDLE_LABELS[h] ?? h}</div>
              <Branch flow={flow} fromId={last.id} handle={h} ctx={ctx} selectedId={selectedId} errorIds={errorIds} hitIds={hitIds} onSelect={onSelect} onAdd={onAdd} readOnly={readOnly} />
            </div>
          ))}
        </div>
      ) : terminal ? (
        <div className="fl-end" />
      ) : (
        <>
          <div className="fl-link" />
          <AddButton readOnly={readOnly} onAdd={t => onAdd(last ? last.id : fromId, last ? lastHandles[0] : handle, t)} />
        </>
      )}
    </div>
  );
}

export default function FlowCanvas({ flow, ctx, selectedId, errors = [], hits = [], onSelect, onAdd, readOnly }) {
  const start = nodeById(flow, 'start');
  const errorIds = new Set(errors.map(e => e.nodeId).filter(Boolean));
  const hitIds = new Set(hits);
  return (
    <div className="fl-canvas">
      <div className="fl-branch">
        <NodeCard node={start} flow={flow} ctx={ctx} selected={selectedId === 'start'} hasError={errorIds.has('start')} hit={hitIds.has('start')} onSelect={onSelect} />
        <Branch flow={flow} fromId="start" handle="next" ctx={ctx} selectedId={selectedId} errorIds={errorIds} hitIds={hitIds} onSelect={onSelect} onAdd={onAdd} readOnly={readOnly} />
      </div>
    </div>
  );
}
