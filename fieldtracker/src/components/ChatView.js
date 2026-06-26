import { useState, useRef, useCallback, useEffect } from 'react';
import { T, SYSTEM_PROMPT, PHOTO_CATEGORIES, STATUS_CFG, STATUS_ORDER } from '../utils/constants';
import { haptic, formatTime, wordCount, fileToBase64, compressImage, saveDraft, loadDraft, buildExportText } from '../utils/helpers';
import { Btn, Toast, Lightbox, LoadingDots, OfflineBanner, Photo, Divider } from './UI';
import { useVoice, useAutoResize, useToast } from '../hooks';
import { callAI } from '../utils/helpers';
import { putPhoto, getPhoto, newPhotoId } from '../utils/photoStore';
import { downloadJobPDF } from '../utils/pdf';

const TABS = [
  { key: 'chat',  icon: '💬', label: 'Chat'      },
  { key: 'note',  icon: '📝', label: 'Work Note' },
  { key: 'parts', icon: '🔩', label: 'Parts'     },
  { key: 'info',  icon: 'ℹ️',  label: 'Info'      },
];

export default function ChatView({ job, onUpdate, onBack, onDelete, apiKey, hideBack = false }) {
  const [activeTab, setActiveTab] = useState('chat');

  // ── Chat ────────────────────────────────────────────────────────────────────
  const [input, setInput]         = useState(() => loadDraft(job.id));
  const [staged, setStaged]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [streaming, setStreaming] = useState('');
  const [status, setStatus]       = useState(job.status);
  const [lightbox, setLightbox]   = useState(null);
  const [showSuggest, setShowSuggest] = useState(false);

  // ── Notes ───────────────────────────────────────────────────────────────────
  const [notes, setNotes]       = useState(job.finalNotes || '');
  const [notesGen, setNotesGen] = useState(false);
  const [noteFlash, setNoteFlash] = useState(false);
  const [structured, setStructured] = useState(false);

  // ── Work Note ───────────────────────────────────────────────────────────────
  const [workNote, setWorkNote]       = useState(job.workNote || '');
  const [workNoteGen, setWorkNoteGen] = useState(false);

  // ── Parts ───────────────────────────────────────────────────────────────────
  const [parts, setParts]             = useState(job.parts || []);
  const [partsNeeded, setPartsNeeded] = useState(job.partsNeeded || []);
  const [materials, setMaterials]     = useState(job.materials || []);
  const [newPart, setNewPart]         = useState({ name: '', partNumber: '', qty: 1, cost: '' });
  const [newNeeded, setNewNeeded]     = useState('');
  const [newMaterial, setNewMaterial] = useState('');

  // ── Info edit ───────────────────────────────────────────────────────────────
  const [editMode, setEditMode]         = useState(false);
  const [editTitle, setEditTitle]       = useState(job.title || '');
  const [editLoc, setEditLoc]           = useState(job.location || '');
  const [editBuilding, setEditBuilding] = useState(job.building || '');
  const [editFloor, setEditFloor]       = useState(job.floor || '');
  const [editRoom, setEditRoom]         = useState(job.room || '');
  const [editBrand, setEditBrand]       = useState(job.equipment?.brand || '');
  const [editModel, setEditModel]       = useState(job.equipment?.model || '');
  const [editSerial, setEditSerial]     = useState(job.equipment?.serial || '');

  // ── Photos ──────────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState([]);

  const { toast, show: showToast, hide: hideToast } = useToast();
  const bottomRef = useRef();
  const fileRef   = useRef();
  const taRef     = useAutoResize(input);

  // Sync external prop changes
  useEffect(() => { setStatus(job.status); }, [job.status]);
  useEffect(() => { setParts(job.parts || []); }, [job.parts]);
  useEffect(() => { setPartsNeeded(job.partsNeeded || []); }, [job.partsNeeded]);
  useEffect(() => { setNotes(job.finalNotes || ''); }, [job.finalNotes]);
  useEffect(() => { setWorkNote(job.workNote || ''); }, [job.workNote]);

  // Load photo metadata
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = [];
      for (const m of job.messages || []) for (const pid of m._photoIds || []) ids.push(pid);
      const recs = [];
      for (const pid of ids) {
        const rec = await getPhoto(pid);
        if (rec) recs.push({ id: pid, category: rec.category || 'other', caption: rec.caption || '' });
      }
      if (alive) setPhotos(recs);
    })();
    return () => { alive = false; };
  }, [job.messages]);

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => saveDraft(job.id, input), 800);
    return () => clearTimeout(t);
  }, [input, job.id]);

  const { listening, toggle: toggleVoice } = useVoice(
    useCallback(t => { setInput(prev => prev ? prev + ' ' + t : t); taRef.current?.focus(); }, [taRef])
  );

  function buildSystemPrompt() {
    const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || 'Not specified';
    const equip = job.equipment && (job.equipment.brand || job.equipment.model)
      ? `\nEquipment: ${[job.equipment.brand, job.equipment.model, job.equipment.serial && `S/N ${job.equipment.serial}`].filter(Boolean).join(' ')}` : '';
    return `${SYSTEM_PROMPT}\n\nCURRENT JOB:\nWork Order: #${job.woNumber}${job.title ? `\nJob: ${job.title}` : ''}\nLocation: ${place}\nStatus: ${job.status}${equip}`;
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  async function send(overrideText = null) {
    const text = (overrideText ?? input).trim();
    if (!text && staged.length === 0) return;
    if (!apiKey) { showToast('No API key — go to Info tab', 'error'); return; }

    haptic('light');
    saveDraft(job.id, '');
    const ts = Date.now();

    const photoIds = [];
    for (const p of staged) {
      const pid = newPhotoId();
      const ok = await putPhoto(pid, { data: p.data, mime: p.mime, category: p.category || 'other', caption: '' });
      if (ok) photoIds.push(pid);
    }

    const userContent = [];
    for (const p of staged) userContent.push({ type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data}`, detail: 'auto' } });
    if (text) userContent.push({ type: 'text', text });

    const storedContent = text ? [{ type: 'text', text }] : [];
    const userMsg  = { role: 'user', content: storedContent, _photoIds: photoIds, _ts: ts };
    const nextMsgs = [...(job.messages || []), userMsg];
    onUpdate({ messages: nextMsgs, photoCount: (job.photoCount || 0) + photoIds.length });
    setInput(''); setStaged([]); setLoading(true); setStreaming(''); scrollBottom();

    try {
      const apiMsgs = await Promise.all(nextMsgs.map(async (m) => {
        if (m === userMsg) return { role: m.role, content: userContent };
        if (m._photoIds?.length) {
          const imgs = [];
          for (const pid of m._photoIds) {
            const rec = await getPhoto(pid);
            if (rec) imgs.push({ type: 'image_url', image_url: { url: `data:${rec.mime};base64,${rec.data}`, detail: 'auto' } });
          }
          return { role: m.role, content: [...imgs, ...(m.content || [])] };
        }
        return { role: m.role, content: m.content };
      }));

      let full = '';
      await callAI(apiMsgs, buildSystemPrompt(), apiKey, chunk => { full = chunk; setStreaming(chunk); scrollBottom(); });
      setStreaming('');
      const aiMsg = { role: 'assistant', content: [{ type: 'text', text: full }], _ts: Date.now() };
      onUpdate({ messages: [...nextMsgs, aiMsg] });
      setShowSuggest(true);
    } catch (e) {
      setStreaming('');
      onUpdate({ messages: [...nextMsgs, { role: 'assistant', content: [{ type: 'text', text: `⚠️ ${e.message}` }], _ts: Date.now(), _error: true }] });
      showToast('AI error', 'error');
    }
    setLoading(false); scrollBottom();
  }

  async function retryMessage(idx) {
    const msgs = [...(job.messages || [])];
    msgs.splice(idx, 1);
    onUpdate({ messages: msgs });
    const prev = msgs[msgs.length - 1];
    const text = prev?.content?.find(b => b.type === 'text')?.text || '';
    if (text) await send(text);
  }

  async function pickPhotos(e) {
    const files = Array.from(e.target.files);
    const compressed = await Promise.all(files.map(compressImage));
    const loaded = await Promise.all(compressed.map(fileToBase64));
    setStaged(prev => [...prev, ...loaded.map(p => ({ ...p, category: 'other' }))]);
    e.target.value = '';
  }

  function changeStatus(s) {
    setStatus(s); onUpdate({ status: s });
    if (s === 'complete' && !job.endTime) onUpdate({ endTime: Date.now() });
    if (s === 'in-progress' && !job.startTime) onUpdate({ startTime: Date.now() });
  }

  function handleBack() {
    if (input.trim() && !window.confirm('Unsent message — leave anyway?')) return;
    saveDraft(job.id, ''); onBack();
  }

  // ── Work Note ────────────────────────────────────────────────────────────────
  function hasEnoughInfo() {
    return (job.messages || []).some(m => m.content?.find(b => b.type === 'text')?.text?.trim())
      || (job.messages || []).some(m => m._photoIds?.length > 0)
      || notes.trim() || job.title?.trim();
  }

  function buildWorkNotePrompt() {
    const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || '';
    const equip = job.equipment && (job.equipment.brand || job.equipment.model)
      ? [job.equipment.brand, job.equipment.model, job.equipment.serial && `S/N ${job.equipment.serial}`].filter(Boolean).join(' ') : '';
    const chatLines = (job.messages || []).map(m => {
      const text = m.content?.find(b => b.type === 'text')?.text || '';
      const ph   = m._photoIds?.length ? `[${m._photoIds.length} photo(s)]` : '';
      if (!text && !ph) return null;
      return m.role === 'user' ? `Tech: ${[ph, text].filter(Boolean).join(' ')}` : `AI: ${text}`;
    }).filter(Boolean).join('\n');
    const partsLine  = parts.length ? parts.map(p => `${p.name}${p.partNumber ? ` (#${p.partNumber})` : ''}${p.qty > 1 ? ` x${p.qty}` : ''}`).join(', ') : '';
    const neededLine = partsNeeded.length ? partsNeeded.map(p => p.name).join(', ') : '';
    const captions   = photos.filter(p => p.caption).map(p => `${p.category}: ${p.caption}`).join('; ');
    const ctx = [
      place      && `Location: ${place}`,
      equip      && `Equipment: ${equip}`,
      job.title  && `Job: ${job.title}`,
      chatLines  && `Notes/chat:\n${chatLines}`,
      partsLine  && `Parts used: ${partsLine}`,
      neededLine && `Parts still needed: ${neededLine}`,
      captions   && `Photo captions: ${captions}`,
      notes      && `Completion notes: ${notes}`,
    ].filter(Boolean).join('\n\n');

    return `You are writing a short work order note for a facilities technician to paste into their company's work order system.

Write 2–6 sentences in past tense. State what was checked. State what was found. State what was done. Mention parts only if they were actually used. Mention follow-up only if needed. No filler. No exaggeration. Do not invent work. Write like an experienced facilities technician — not like AI.

Examples:
- "Checked shower due to no hot water. Verified hot water supply to the valve and found the cartridge was not mixing properly. Shower will need a replacement cartridge to restore normal operation."
- "Patched damaged drywall where wall anchors were removed. Sanded repairs smooth and left the wall ready for paint."
- "Inspected sink after reports of a leak. Found the drain connection had loosened under the vanity. Tightened the fitting, tested operation, and confirmed no leaks at this time."

Job info:
${ctx}

Write only the note. No labels, no headers.`;
  }

  async function generateWorkNote() {
    if (!apiKey) { showToast('No API key — go to Info tab', 'error'); return; }
    if (!hasEnoughInfo()) { showToast('Add chat notes or photos first', 'error'); return; }
    setWorkNoteGen(true);
    try {
      const result = await callAI([{ role: 'user', content: [{ type: 'text', text: buildWorkNotePrompt() }] }], '', apiKey);
      const cleaned = result.trim();
      setWorkNote(cleaned); onUpdate({ workNote: cleaned });
      showToast('✓ Work note generated', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    setWorkNoteGen(false);
  }

  // ── Completion Notes ─────────────────────────────────────────────────────────
  function buildNotesPrompt() {
    const history  = (job.messages || []).map(m => {
      const role = m.role === 'user' ? 'Tech' : 'AI';
      const text = m.content?.find(b => b.type === 'text')?.text || '';
      const ph   = m._photoIds?.length ? `[${m._photoIds.length} photo(s)]` : '';
      return `${role}: ${[ph, text].filter(Boolean).join(' ')}`;
    }).join('\n');
    const place    = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || '';
    const partsLine = parts.length ? `\n\nParts used: ${parts.map(p => `${p.name}${p.partNumber ? ` (#${p.partNumber})` : ''} x${p.qty || 1}`).join(', ')}` : '';
    const equip    = job.equipment && (job.equipment.brand || job.equipment.model) ? `\n\nEquipment: ${[job.equipment.brand, job.equipment.model].filter(Boolean).join(' ')}` : '';
    const fmt = structured
      ? `Format under these headers:\nFOUND:\nFIXED:\nPARTS USED:\nFOLLOW-UP:\nConcise paragraph under each (or "None").`
      : `Single professional paragraph: what was found, performed, materials used, follow-up needed.`;
    return `Write work order completion notes for WO #${job.woNumber}${place ? ' at ' + place : ''}.${partsLine}${equip}\n\nChat:\n${history}\n\n${fmt}`;
  }

  async function generateNotes() {
    if (!job.messages?.length) { showToast('No chat history yet', 'error'); return; }
    if (!apiKey) { showToast('No API key', 'error'); return; }
    setNotesGen(true);
    try {
      const result = await callAI([{ role: 'user', content: [{ type: 'text', text: buildNotesPrompt() }] }], SYSTEM_PROMPT, apiKey);
      setNotes(result); onUpdate({ finalNotes: result });
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    setNotesGen(false);
  }

  function saveNotes() {
    onUpdate({ finalNotes: notes, parts, partsNeeded, materials });
    setNoteFlash(true); setTimeout(() => setNoteFlash(false), 1800);
  }

  async function exportPDF() {
    showToast('Building PDF…', 'info');
    const ok = await downloadJobPDF({ ...job, finalNotes: notes, parts, partsNeeded, materials }, photos);
    if (!ok) showToast('PDF failed', 'error');
  }

  function shareJob() {
    const text = buildExportText({ ...job, finalNotes: notes, parts });
    if (navigator.share) navigator.share({ title: `WO #${job.woNumber}`, text }).catch(() => {});
    else { navigator.clipboard.writeText(text); showToast('📋 Copied to clipboard', 'success'); }
  }

  // ── Parts ────────────────────────────────────────────────────────────────────
  function addPart() {
    if (!newPart.name.trim()) return;
    const u = [...parts, { ...newPart, id: Date.now() }]; setParts(u); onUpdate({ parts: u });
    setNewPart({ name: '', partNumber: '', qty: 1, cost: '' });
  }
  function removePart(id) { const u = parts.filter(p => p.id !== id); setParts(u); onUpdate({ parts: u }); }
  function addNeeded() {
    if (!newNeeded.trim()) return;
    const u = [...partsNeeded, { id: Date.now(), name: newNeeded.trim(), ordered: false }]; setPartsNeeded(u); onUpdate({ partsNeeded: u }); setNewNeeded('');
  }
  function toggleNeeded(id) { const u = partsNeeded.map(p => p.id === id ? { ...p, ordered: !p.ordered } : p); setPartsNeeded(u); onUpdate({ partsNeeded: u }); }
  function removeNeeded(id) { const u = partsNeeded.filter(p => p.id !== id); setPartsNeeded(u); onUpdate({ partsNeeded: u }); }
  function addMaterial() {
    if (!newMaterial.trim()) return;
    const u = [...materials, { id: Date.now(), name: newMaterial.trim(), done: false }]; setMaterials(u); onUpdate({ materials: u }); setNewMaterial('');
  }
  function toggleMaterial(id) { const u = materials.map(m => m.id === id ? { ...m, done: !m.done } : m); setMaterials(u); onUpdate({ materials: u }); }
  function removeMaterial(id) { const u = materials.filter(m => m.id !== id); setMaterials(u); onUpdate({ materials: u }); }

  async function autoExtractParts() {
    if (!job.messages?.length || !apiKey) { showToast('Need chat history + API key', 'error'); return; }
    showToast('Extracting…', 'info');
    try {
      const history = job.messages.map(m => m.content?.find(b => b.type === 'text')?.text || '').join('\n');
      const result  = await callAI([{ role: 'user', content: [{ type: 'text', text: `Extract every part, material, or supply mentioned. Return only a JSON array: [{"name":string,"partNumber":string|null,"qty":number}]. Conversation:\n${history}` }] }], '', apiKey);
      const raw = JSON.parse(result.replace(/```json|```/g, '').trim());
      const extracted = (Array.isArray(raw) ? raw : []).map((p, i) => ({ id: Date.now() + i, name: p.name || 'Unknown', partNumber: p.partNumber || '', qty: Number(p.qty) || 1, cost: '' }));
      const u = [...parts, ...extracted]; setParts(u); onUpdate({ parts: u });
      showToast(`✓ ${extracted.length} parts extracted`, 'success');
    } catch { showToast('Could not extract parts', 'error'); }
  }

  // ── Info save ────────────────────────────────────────────────────────────────
  function saveInfo() {
    onUpdate({ title: editTitle.trim(), location: editLoc.trim(), building: editBuilding.trim(), floor: editFloor.trim(), room: editRoom.trim(), equipment: { brand: editBrand.trim(), model: editModel.trim(), serial: editSerial.trim() } });
    setEditMode(false); showToast('✓ Info saved', 'success');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  const msgs = job.messages || [];
  const totalCost = parts.reduce((s, p) => s + (Number(p.cost || 0) * Number(p.qty || 1)), 0);
  const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || '';
  const inputStyle = { background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: '8px 10px', fontSize: 13, color: T.text, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', width: '100%' };

  // ── Tab: Chat ────────────────────────────────────────────────────────────────
  function renderChat() {
    const suggestions = [
      "What's wrong here? Walk me through the fix.",
      'What parts do I need? Grainger numbers if possible.',
      'Write my work order notes from this conversation.',
    ];
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 13px 4px' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: T.muted }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 6 }}>Chat about WO #{job.woNumber}</div>
            <div style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Upload photos, use voice, ask questions — everything is saved.</div>
            {suggestions.map(q => (
              <button key={q} onClick={() => { setInput(q); taRef.current?.focus(); }} style={{
                display: 'block', width: '100%', textAlign: 'left', background: T.card,
                border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px',
                color: T.muted, cursor: 'pointer', fontSize: 13, marginBottom: 8, fontFamily: 'inherit',
              }}>{q}</button>
            ))}
          </div>
        )}

        {msgs.map((msg, i) => {
          const isUser   = msg.role === 'user';
          const text     = msg.content?.find(b => b.type === 'text')?.text || '';
          const photoIds = msg._photoIds || [];
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
              {photoIds.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                  {photoIds.map((pid, pi) => (
                    <Photo key={pi} id={pid} onClick={() => setLightbox(pid)}
                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}`, cursor: 'zoom-in' }} />
                  ))}
                </div>
              )}
              {text && (
                <div style={{ position: 'relative', maxWidth: '88%' }}>
                  <div style={{
                    background: isUser ? '#1e3a5f' : T.card,
                    border: `1px solid ${isUser ? '#1e40af' : T.border}`,
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    padding: '10px 14px', lineHeight: 1.65, fontSize: 14,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: msg._error ? 0.7 : 1,
                  }}>{text}</div>
                  {!isUser && (
                    <button onClick={() => { navigator.clipboard.writeText(text); showToast('✓ Copied', 'success'); }} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 5, color: T.muted, fontSize: 10, padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>copy</button>
                  )}
                  {msg._error && (
                    <button onClick={() => retryMessage(i)} style={{ marginTop: 4, background: 'transparent', border: `1px solid ${T.red}`, borderRadius: 6, color: T.red, fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>↺ Retry</button>
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
                {isUser ? 'You' : 'AI'}{msg._ts ? ` · ${formatTime(msg._ts)}` : ''}
              </div>
            </div>
          );
        })}

        {streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: '14px 14px 14px 4px', padding: '10px 14px', maxWidth: '88%', lineHeight: 1.65, fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {streaming}<span style={{ opacity: 0.5 }}>▊</span>
            </div>
          </div>
        )}

        {loading && !streaming && (
          <div style={{ display: 'flex', marginBottom: 14 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: '14px 14px 14px 4px', padding: '12px 16px' }}><LoadingDots /></div>
          </div>
        )}

        {showSuggest && !loading && msgs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Suggested:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['What parts do I need? Give me Grainger numbers.', 'Are there any safety concerns to note?', 'What should I check before closing this out?'].map(s => (
                <button key={s} onClick={() => { setShowSuggest(false); send(s); }} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '5px 11px', fontSize: 12, color: T.muted, cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>
              ))}
              <button onClick={() => setShowSuggest(false)} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>
    );
  }

  // ── Tab: Work Note ────────────────────────────────────────────────────────────
  function renderWorkNote() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

        {/* WORK NOTE */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Work Note</div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 14, lineHeight: 1.55 }}>
            Short note to paste into your work order system — 2–6 sentences, written the way a tech writes it.
          </div>

          {!hasEnoughInfo() && !workNote ? (
            <div style={{ fontSize: 13, color: T.muted, padding: '14px', background: T.faint, borderRadius: 10, textAlign: 'center', marginBottom: 4 }}>
              Add notes in the Chat tab or upload photos first.
            </div>
          ) : workNote ? (
            <>
              <textarea
                value={workNote}
                onChange={e => { setWorkNote(e.target.value); onUpdate({ workNote: e.target.value }); }}
                rows={5}
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, color: T.text, resize: 'vertical', outline: 'none', lineHeight: 1.65, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { navigator.clipboard.writeText(workNote); showToast('✓ Copied!', 'success'); haptic('light'); }} style={{ flex: 2, background: T.green, color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  📋 Copy Work Note
                </button>
                <button onClick={generateWorkNote} disabled={workNoteGen} style={{ flex: 1, background: 'transparent', color: T.muted, border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px', fontSize: 13, fontWeight: 600, cursor: workNoteGen ? 'not-allowed' : 'pointer', opacity: workNoteGen ? 0.5 : 1, fontFamily: 'inherit' }}>
                  {workNoteGen ? '⏳' : '↺ Redo'}
                </button>
              </div>
            </>
          ) : (
            <button onClick={generateWorkNote} disabled={workNoteGen} style={{ width: '100%', background: workNoteGen ? T.faint : T.blue, color: workNoteGen ? T.muted : '#fff', border: 'none', borderRadius: 10, padding: '16px', fontSize: 15, fontWeight: 700, cursor: workNoteGen ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {workNoteGen ? '⏳ Writing…' : '✦ Generate Work Note'}
            </button>
          )}
        </div>

        {/* DETAILED NOTES */}
        <Divider label="Detailed Completion Notes" />
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[{ k: false, l: 'Paragraph' }, { k: true, l: 'Structured (Found/Fixed)' }].map(o => (
            <button key={String(o.k)} onClick={() => setStructured(o.k)} style={{ flex: 1, background: structured === o.k ? T.blue + '28' : 'transparent', color: structured === o.k ? T.blue : T.muted, border: `1px solid ${structured === o.k ? T.blue : T.border}`, borderRadius: 8, padding: '7px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{o.l}</button>
          ))}
        </div>
        <Btn onClick={generateNotes} disabled={notesGen} color={T.blueDim} style={{ width: '100%', justifyContent: 'center', marginBottom: 10, padding: 11 }}>
          {notesGen ? '⏳ Generating…' : (notes ? '✨ Regenerate from Chat' : '✨ Generate from Chat')}
        </Btn>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={7} placeholder="Detailed notes will appear here, or write your own…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.65, minHeight: 120, marginBottom: 8 }} />
        {notes && <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>{wordCount(notes)} words</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn small color={noteFlash ? T.green : T.blue} onClick={saveNotes} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}>{noteFlash ? '✓ Saved' : 'Save Notes'}</Btn>
          {notes && <Btn ghost small onClick={() => { navigator.clipboard.writeText(notes); showToast('✓ Copied', 'success'); }} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}>📋 Copy</Btn>}
          {notes && <Btn ghost small onClick={shareJob} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}>📤 Share</Btn>}
          {notes && <Btn ghost small onClick={exportPDF} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}>📄 PDF</Btn>}
        </div>
      </div>
    );
  }

  // ── Tab: Parts ────────────────────────────────────────────────────────────────
  function renderParts() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <Btn ghost onClick={autoExtractParts} style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }}>🔩 Auto-Extract Parts from Chat</Btn>

        <Divider label="Parts Used" />
        {parts.map(p => (
          <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 13px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: T.muted }}>{p.partNumber && `#${p.partNumber} · `}qty {p.qty}{p.cost ? ` · $${(Number(p.cost) * Number(p.qty)).toFixed(2)}` : ''}</div>
            </div>
            <button onClick={() => removePart(p.id)} style={{ background: 'transparent', border: 'none', color: T.red, cursor: 'pointer', fontSize: 20, padding: 4, fontFamily: 'inherit', lineHeight: 1 }}>×</button>
          </div>
        ))}
        {parts.length > 0 && <div style={{ textAlign: 'right', fontSize: 13, color: T.green, fontWeight: 700, marginBottom: 12 }}>Total: ${totalCost.toFixed(2)}</div>}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Add Part Used</div>
          <input value={newPart.name} onChange={e => setNewPart(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addPart()} placeholder="Part name" style={{ ...inputStyle, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input value={newPart.partNumber} onChange={e => setNewPart(p => ({ ...p, partNumber: e.target.value }))} placeholder="Part #" style={{ ...inputStyle }} />
            <input value={newPart.qty} onChange={e => setNewPart(p => ({ ...p, qty: e.target.value }))} placeholder="Qty" type="number" min="1" style={{ ...inputStyle, maxWidth: 60 }} />
            <input value={newPart.cost} onChange={e => setNewPart(p => ({ ...p, cost: e.target.value }))} placeholder="$" type="number" step="0.01" style={{ ...inputStyle, maxWidth: 70 }} />
          </div>
          <Btn full small onClick={addPart} disabled={!newPart.name.trim()}>+ Add Part</Btn>
        </div>

        <Divider label="Parts Needed / To Order" />
        {partsNeeded.map(p => (
          <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 13px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => toggleNeeded(p.id)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${p.ordered ? T.green : T.border}`, background: p.ordered ? T.green : 'transparent', cursor: 'pointer', flexShrink: 0, color: '#fff', fontSize: 13, lineHeight: 1 }}>{p.ordered ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 13, textDecoration: p.ordered ? 'line-through' : 'none', color: p.ordered ? T.muted : T.text }}>{p.name}</span>
            <button onClick={() => removeNeeded(p.id)} style={{ background: 'transparent', border: 'none', color: T.red, cursor: 'pointer', fontSize: 18, fontFamily: 'inherit' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <input value={newNeeded} onChange={e => setNewNeeded(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNeeded()} placeholder="e.g. Flushmate cartridge" style={{ ...inputStyle }} />
          <Btn small onClick={addNeeded} disabled={!newNeeded.trim()}>+ Add</Btn>
        </div>

        <Divider label="Material Checklist" />
        {materials.map(m => (
          <div key={m.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 13px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => toggleMaterial(m.id)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${m.done ? T.green : T.border}`, background: m.done ? T.green : 'transparent', cursor: 'pointer', flexShrink: 0, color: '#fff', fontSize: 13, lineHeight: 1 }}>{m.done ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 13, textDecoration: m.done ? 'line-through' : 'none', color: m.done ? T.muted : T.text }}>{m.name}</span>
            <button onClick={() => removeMaterial(m.id)} style={{ background: 'transparent', border: 'none', color: T.red, cursor: 'pointer', fontSize: 18, fontFamily: 'inherit' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <input value={newMaterial} onChange={e => setNewMaterial(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMaterial()} placeholder="e.g. Teflon tape, wire nuts" style={{ ...inputStyle }} />
          <Btn small onClick={addMaterial} disabled={!newMaterial.trim()}>+ Add</Btn>
        </div>

        {photos.length > 0 && (
          <>
            <Divider label={`Photos (${photos.length})`} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {photos.map(p => (
                <Photo key={p.id} id={p.id} onClick={() => setLightbox(p.id)}
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}`, cursor: 'zoom-in' }} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Tab: Info ─────────────────────────────────────────────────────────────────
  function renderInfo() {
    const cfg = STATUS_CFG[status] || STATUS_CFG.open;
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!editMode ? (
          <>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{job.title || `WO #${job.woNumber}`}</div>
                  {job.title && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>WO #{job.woNumber}</div>}
                </div>
                <span style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44`, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99 }}>{cfg.label}</span>
              </div>
              {place                                           && <InfoRow label="Location"  value={place} />}
              {job.date                                        && <InfoRow label="Date"       value={job.date} />}
              {(job.equipment?.brand || job.equipment?.model)  && <InfoRow label="Equipment" value={[job.equipment.brand, job.equipment.model, job.equipment.serial && `S/N ${job.equipment.serial}`].filter(Boolean).join(' ')} />}
              {job.priority && job.priority !== 'normal'       && <InfoRow label="Priority"  value={job.priority.toUpperCase()} />}
              {job.tags?.length > 0                            && <InfoRow label="Tags"       value={job.tags.join(', ')} />}
              {job.mileage                                     && <InfoRow label="Mileage"   value={`${job.mileage} miles`} />}
            </div>

            <Divider label="Status" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {STATUS_ORDER.map(s => {
                const c = STATUS_CFG[s];
                return (
                  <button key={s} onClick={() => { haptic('light'); changeStatus(s); }} style={{ background: status === s ? c.color + '28' : 'transparent', color: status === s ? c.color : T.muted, border: `1px solid ${status === s ? c.color : T.border}`, borderRadius: 99, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{c.label}</button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn ghost small onClick={() => setEditMode(true)} style={{ flex: 1, justifyContent: 'center' }}>✎ Edit Info</Btn>
              <Btn ghost small onClick={shareJob} style={{ flex: 1, justifyContent: 'center' }}>📤 Share</Btn>
              <Btn danger small onClick={onDelete} style={{ flex: 1, justifyContent: 'center' }}>🗑 Delete</Btn>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Edit Job Info</div>
            {[
              { label: 'Job Title',       val: editTitle,    set: setEditTitle,    ph: 'e.g. Replace shower cartridge' },
              { label: 'Location / Site', val: editLoc,      set: setEditLoc,      ph: 'e.g. MGH Main Campus'          },
              { label: 'Building',        val: editBuilding, set: setEditBuilding, ph: 'Building name'                 },
              { label: 'Floor',           val: editFloor,    set: setEditFloor,    ph: 'e.g. 3'                        },
              { label: 'Room',            val: editRoom,     set: setEditRoom,     ph: 'e.g. 312'                      },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</div>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={inputStyle} />
              </div>
            ))}
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Equipment</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <input value={editBrand}  onChange={e => setEditBrand(e.target.value)}  placeholder="Brand"    style={inputStyle} />
              <input value={editModel}  onChange={e => setEditModel(e.target.value)}  placeholder="Model"    style={inputStyle} />
              <input value={editSerial} onChange={e => setEditSerial(e.target.value)} placeholder="Serial #" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={saveInfo} style={{ flex: 1, justifyContent: 'center' }}>Save</Btn>
              <Btn ghost onClick={() => setEditMode(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={hideBack ? '' : 'app-fill'} style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text, display: 'flex', flexDirection: 'column', height: hideBack ? '100%' : undefined }}>
      {lightbox && <Lightbox photoId={lightbox} onClose={() => setLightbox(null)} />}
      {toast    && <Toast message={toast.message} type={toast.type} onDone={hideToast} />}

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {!hideBack && <Btn ghost small onClick={handleBack} style={{ flexShrink: 0 }}>← Jobs</Btn>}
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title || `WO #${job.woNumber}`}</div>
          <div style={{ fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.title ? `WO #${job.woNumber}` : ''}{job.title && place ? ' · ' : ''}{place}
          </div>
        </div>
        {hideBack && <div style={{ width: 60 }} />}
      </div>

      <OfflineBanner />

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === 'chat'  && renderChat()}
        {activeTab === 'note'  && renderWorkNote()}
        {activeTab === 'parts' && renderParts()}
        {activeTab === 'info'  && renderInfo()}
      </div>

      {/* Chat input bar */}
      {activeTab === 'chat' && (
        <>
          {staged.length > 0 && (
            <div style={{ background: T.surface, borderTop: `1px solid ${T.border}`, padding: '8px 13px', display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
              {staged.map((p, i) => {
                const cat = PHOTO_CATEGORIES.find(c => c.key === (p.category || 'other')) || PHOTO_CATEGORIES[5];
                return (
                  <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                    <img src={p.preview} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}` }} />
                    <button onClick={() => setStaged(prev => prev.map((s, j) => { if (j !== i) return s; const idx = PHOTO_CATEGORIES.findIndex(c => c.key === (s.category || 'other')); return { ...s, category: PHOTO_CATEGORIES[(idx + 1) % PHOTO_CATEGORIES.length].key }; }))} style={{ background: cat.color + '22', color: cat.color, border: `1px solid ${cat.color}55`, borderRadius: 99, padding: '1px 7px', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{cat.label}</button>
                    <button onClick={() => setStaged(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -5, right: -5, background: T.red, color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                  </div>
                );
              })}
            </div>
          )}
          {input.trim() && <div style={{ background: T.surface, padding: '3px 14px', fontSize: 11, color: T.muted, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>Draft · {wordCount(input)} word{wordCount(input) !== 1 ? 's' : ''}</div>}
          <div style={{ background: T.surface, borderTop: `1px solid ${T.border}`, padding: '10px 12px', display: 'flex', gap: 7, alignItems: 'flex-end', flexShrink: 0 }}>
            <button onClick={() => fileRef.current.click()} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 11px', cursor: 'pointer', color: T.muted, fontSize: 18, flexShrink: 0, lineHeight: 1, fontFamily: 'inherit' }}>📷</button>
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }} onChange={pickPhotos} />
            <button onClick={toggleVoice} style={{ background: listening ? T.red + '33' : T.card, border: `1px solid ${listening ? T.red : T.border}`, borderRadius: 8, padding: '9px 11px', cursor: 'pointer', color: listening ? T.red : T.muted, fontSize: 18, flexShrink: 0, lineHeight: 1, fontFamily: 'inherit', animation: listening ? 'pulse 1s infinite' : 'none' }}>🎤</button>
            <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={listening ? '🎤 Listening…' : 'Ask anything or describe what you did…'} rows={1}
              style={{ flex: 1, background: T.bg, border: `1px solid ${listening ? T.red : T.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: T.text, resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: 120, fontFamily: 'inherit' }} />
            <button onClick={() => send()} disabled={loading || (!input.trim() && staged.length === 0)} style={{ background: T.blue, border: 'none', borderRadius: 8, padding: '9px 13px', cursor: 'pointer', color: '#fff', fontSize: 20, flexShrink: 0, lineHeight: 1, fontFamily: 'inherit', opacity: (loading || (!input.trim() && staged.length === 0)) ? 0.35 : 1 }}>↑</button>
          </div>
        </>
      )}

      {/* Bottom Tab Bar */}
      <div style={{ display: 'flex', background: T.surface, borderTop: `1px solid ${T.border}`, flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const badge = tab.key === 'parts' && (parts.length + partsNeeded.length) > 0;
          return (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); haptic('light'); }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px 8px', background: 'transparent', border: 'none', cursor: 'pointer', color: active ? T.blue : T.muted, position: 'relative' }}>
              {active && <div style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: 2, background: T.blue, borderRadius: 99 }} />}
              <span style={{ fontSize: 20, lineHeight: 1, marginBottom: 3 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: 'inherit' }}>{tab.label}</span>
              {badge && <div style={{ position: 'absolute', top: 8, right: '18%', background: T.blue, borderRadius: '50%', width: 7, height: 7 }} />}
            </button>
          );
        })}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 }}>
      <div style={{ color: T.muted, minWidth: 80, flexShrink: 0 }}>{label}</div>
      <div style={{ color: T.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
