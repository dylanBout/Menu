import { useState, useEffect } from 'react';
import { T, PRIORITY_CFG, JOB_TAGS, SYSTEM_PROMPT, PHOTO_CATEGORIES } from '../utils/constants';
import { cleanWoNumber, wordCount, haptic, buildExportText, getStorageSize, callAI } from '../utils/helpers';
import { estimateUsage, getPhoto } from '../utils/photoStore';
import { downloadJobPDF } from '../utils/pdf';
import { Btn, Label, Header, TextInput, Textarea, Divider, Toast, Photo, Lightbox } from './UI';
import { useToast } from '../hooks';

// ═══════════════════════════════════════════════════════════════════════════════
// NEW JOB
// ═══════════════════════════════════════════════════════════════════════════════
export function NewJobView({ onBack, onCreate, templates, defaultLocation }) {
  const [wo, setWo]       = useState('');
  const [title, setTitle] = useState('');
  const [loc, setLoc]     = useState(defaultLocation || '');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [room, setRoom]   = useState('');
  const [priority, setPriority] = useState('normal');
  const [tags, setTags]   = useState([]);
  const [tmpl, setTmpl]   = useState('');
  const [followUp, setFollowUp] = useState('');
  const [mileage, setMileage]   = useState('');

  function applyTemplate(id) {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setTmpl(id);
    if (t.tags)     setTags(t.tags);
    if (t.priority) setPriority(t.priority);
  }

  function toggleTag(tag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function submit() {
    if (!wo.trim()) return;
    haptic('light');
    const tmplObj = templates.find(t => t.id === tmpl);
    onCreate(cleanWoNumber(wo), loc.trim(), {
      title: title.trim(), building: building.trim(), floor: floor.trim(), room: room.trim(),
      priority, tags,
      followUpDate: followUp || null,
      mileage: mileage ? Number(mileage) : null,
      finalNotes: tmplObj?.notes || '',
    });
  }

  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text }} className="app-min">
      <Header left={<Btn ghost small onClick={onBack}>← Back</Btn>} center="New Work Order" right={<div />} />
      <div style={{ padding: '16px 16px 90px' }}>

        {templates.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Label>Use Template</Label>
            <select value={tmpl} onChange={e => applyTemplate(e.target.value)}
              style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 13px', fontSize: 14, color: T.text, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">— No template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        <TextInput label="Work Order #" value={wo} onChange={e => setWo(cleanWoNumber(e.target.value))}
          placeholder="e.g. 10482" mono hint="Letters, numbers, dashes only — auto-formatted" autoFocus />

        <TextInput label="Job Title (optional)" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Faucet leak — handle drip" hint="Short name shown in the job list" />

        <TextInput label="Location / Site" value={loc} onChange={e => setLoc(e.target.value)}
          placeholder="e.g. MGH Main Campus" />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 2 }}><TextInput label="Building" value={building} onChange={e => setBuilding(e.target.value)} placeholder="Yawkey" /></div>
          <div style={{ flex: 1 }}><TextInput label="Floor" value={floor} onChange={e => setFloor(e.target.value)} placeholder="4" /></div>
          <div style={{ flex: 1 }}><TextInput label="Room" value={room} onChange={e => setRoom(e.target.value)} placeholder="412" /></div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Label>Priority</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PRIORITY_CFG).map(([key, cfg]) => (
              <button key={key} onClick={() => setPriority(key)} style={{
                flex: 1, background: priority === key ? cfg.color + '28' : 'transparent',
                color: priority === key ? cfg.color : T.muted,
                border: `1px solid ${priority === key ? cfg.color : T.border}`,
                borderRadius: 8, padding: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>{cfg.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Label>Tags</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {JOB_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)} style={{
                background: tags.includes(tag) ? T.blue + '28' : 'transparent',
                color: tags.includes(tag) ? T.blue : T.muted,
                border: `1px solid ${tags.includes(tag) ? T.blue : T.border}`,
                borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>{tag}</button>
            ))}
          </div>
        </div>

        <TextInput label="Follow-up Date (optional)" value={followUp} onChange={e => setFollowUp(e.target.value)}
          type="date" style={{ colorScheme: 'dark' }} />

        <TextInput label="Mileage to Site (optional)" value={mileage} onChange={e => setMileage(e.target.value)}
          placeholder="e.g. 24" type="number" />

        <Btn full disabled={!wo.trim()} onClick={submit} style={{ padding: 14, fontSize: 15, marginTop: 8 }}>
          Open Job & Start Chat →
        </Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT JOB
// ═══════════════════════════════════════════════════════════════════════════════
export function EditJobView({ job, onSave, onBack }) {
  const [wo, setWo]           = useState(job.woNumber);
  const [title, setTitle]     = useState(job.title || '');
  const [loc, setLoc]         = useState(job.location || '');
  const [building, setBuilding] = useState(job.building || '');
  const [floor, setFloor]     = useState(job.floor || '');
  const [room, setRoom]       = useState(job.room || '');
  const [priority, setPriority] = useState(job.priority || 'normal');
  const [tags, setTags]       = useState(job.tags || []);
  const [followUp, setFollowUp] = useState(job.followUpDate || '');
  const [mileage, setMileage]   = useState(job.mileage || '');
  const [brand, setBrand]     = useState(job.equipment?.brand || '');
  const [model, setModel]     = useState(job.equipment?.model || '');
  const [serial, setSerial]   = useState(job.equipment?.serial || '');

  function toggleTag(tag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function handleSave() {
    onSave({
      woNumber: cleanWoNumber(wo), title: title.trim(), location: loc,
      building: building.trim(), floor: floor.trim(), room: room.trim(),
      priority, tags, followUpDate: followUp || null,
      mileage: mileage ? Number(mileage) : null,
      equipment: { brand: brand.trim(), model: model.trim(), serial: serial.trim() },
    });
  }

  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text }} className="app-min">
      <Header
        left={<Btn ghost small onClick={onBack}>← Cancel</Btn>}
        center="Edit Work Order"
        right={<Btn small onClick={handleSave}>Save</Btn>}
      />
      <div style={{ padding: 16 }}>
        <TextInput label="Work Order #" value={wo} onChange={e => setWo(cleanWoNumber(e.target.value))} mono autoFocus />
        <TextInput label="Job Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Faucet leak — handle drip" />
        <TextInput label="Location / Site" value={loc} onChange={e => setLoc(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 2 }}><TextInput label="Building" value={building} onChange={e => setBuilding(e.target.value)} /></div>
          <div style={{ flex: 1 }}><TextInput label="Floor" value={floor} onChange={e => setFloor(e.target.value)} /></div>
          <div style={{ flex: 1 }}><TextInput label="Room" value={room} onChange={e => setRoom(e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>Priority</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PRIORITY_CFG).map(([key, cfg]) => (
              <button key={key} onClick={() => setPriority(key)} style={{
                flex: 1, background: priority === key ? cfg.color + '28' : 'transparent',
                color: priority === key ? cfg.color : T.muted,
                border: `1px solid ${priority === key ? cfg.color : T.border}`,
                borderRadius: 8, padding: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>{cfg.label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>Tags</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {JOB_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)} style={{
                background: tags.includes(tag) ? T.blue + '28' : 'transparent',
                color: tags.includes(tag) ? T.blue : T.muted,
                border: `1px solid ${tags.includes(tag) ? T.blue : T.border}`,
                borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>{tag}</button>
            ))}
          </div>
        </div>
        <TextInput label="Follow-up Date" value={followUp} onChange={e => setFollowUp(e.target.value)} type="date" style={{ colorScheme: 'dark' }} />
        <TextInput label="Mileage" value={mileage} onChange={e => setMileage(e.target.value)} type="number" />

        <Divider label="Equipment" />
        <TextInput label="Brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Symmons, Schlage, Armstrong" />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><TextInput label="Model #" value={model} onChange={e => setModel(e.target.value)} mono placeholder="Temptrol" /></div>
          <div style={{ flex: 1 }}><TextInput label="Serial #" value={serial} onChange={e => setSerial(e.target.value)} mono placeholder="optional" /></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTES VIEW
// ═══════════════════════════════════════════════════════════════════════════════
export function NotesView({ job, onUpdate, onBack, apiKey }) {
  const [notes, setNotes]  = useState(job.finalNotes || '');
  const [generating, setGen] = useState(false);
  const [flash, setFlash]  = useState(false);
  const [parts, setParts]  = useState(job.parts || []);
  const [partsNeeded, setPartsNeeded] = useState(job.partsNeeded || []);
  const [materials, setMaterials] = useState(job.materials || []);
  const [newPart, setNewPart] = useState({ name: '', partNumber: '', qty: 1, cost: '' });
  const [newNeeded, setNewNeeded] = useState('');
  const [newMaterial, setNewMaterial] = useState('');
  const [structured, setStructured] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [workNote, setWorkNote] = useState(job.workNote || '');
  const [workNoteGenerating, setWorkNoteGenerating] = useState(false);
  const { toast, show: showToast, hide: hideToast } = useToast();

  // Collect this job's photo IDs (with metadata) for the gallery.
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

  function buildPrompt() {
    const history = (job.messages || []).map(m => {
      const role = m.role === 'user' ? 'Technician' : 'AI';
      const text = m.content?.find(b => b.type === 'text')?.text || '';
      const ph   = (m._photoIds?.length || 0) > 0 ? `[${m._photoIds.length} photo(s)]` : '';
      return `${role}: ${[ph, text].filter(Boolean).join(' ')}`;
    }).join('\n');
    const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || '';
    const partsLine = parts.length ? `\n\nParts used: ${parts.map(p => `${p.name}${p.partNumber ? ` (#${p.partNumber})` : ''} x${p.qty || 1}`).join(', ')}` : '';
    const equip = job.equipment && (job.equipment.brand || job.equipment.model) ? `\n\nEquipment: ${[job.equipment.brand, job.equipment.model, job.equipment.serial && `S/N ${job.equipment.serial}`].filter(Boolean).join(' ')}` : '';
    const fmt = structured
      ? `Format the notes under these exact headers, each on its own line:\nFOUND:\nFIXED:\nPARTS USED:\nFOLLOW-UP:\nUnder each header write a concise professional paragraph (or "None" if not applicable). No bullet points.`
      : `Write in a single professional paragraph format covering what was found, what was performed, materials used, and follow-up needed.`;
    return `Write work order completion notes for WO #${job.woNumber}${place ? ' at ' + place : ''}.${partsLine}${equip}\n\nChat:\n${history}\n\n${fmt} Suitable for submission to facilities management.`;
  }

  async function genFromChat() {
    if (!job.messages?.length) { showToast('No chat history yet', 'error'); return; }
    if (!apiKey) { showToast('No API key — go to Settings', 'error'); return; }
    setGen(true);
    try {
      const result = await callAI([{ role: 'user', content: [{ type: 'text', text: buildPrompt() }] }], SYSTEM_PROMPT, apiKey);
      setNotes(result);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    setGen(false);
  }

  function buildWorkNotePrompt() {
    const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || '';
    const equip = job.equipment && (job.equipment.brand || job.equipment.model)
      ? [job.equipment.brand, job.equipment.model, job.equipment.serial && `S/N ${job.equipment.serial}`].filter(Boolean).join(' ')
      : '';
    const chatLines = (job.messages || []).map(m => {
      const text = m.content?.find(b => b.type === 'text')?.text || '';
      const ph = (m._photoIds?.length || 0) > 0 ? `[${m._photoIds.length} photo(s) attached]` : '';
      if (!text && !ph) return null;
      return m.role === 'user' ? `Tech note: ${[ph, text].filter(Boolean).join(' ')}` : `AI response: ${text}`;
    }).filter(Boolean).join('\n');
    const partsUsed = parts.length ? parts.map(p => `${p.name}${p.partNumber ? ` (#${p.partNumber})` : ''}${p.qty > 1 ? ` x${p.qty}` : ''}`).join(', ') : '';
    const partsNeededList = partsNeeded.length ? partsNeeded.map(p => p.name).join(', ') : '';
    const photoCaptions = photos.filter(p => p.caption).map(p => `${p.category}: ${p.caption}`).join('; ');

    const context = [
      place && `Location: ${place}`,
      equip && `Equipment: ${equip}`,
      job.title && `Job description: ${job.title}`,
      chatLines && `Chat/notes:\n${chatLines}`,
      partsUsed && `Parts used: ${partsUsed}`,
      partsNeededList && `Parts still needed: ${partsNeededList}`,
      photoCaptions && `Photo captions: ${photoCaptions}`,
      notes && `Completion notes: ${notes}`,
    ].filter(Boolean).join('\n\n');

    return `You are writing a short work order note for a facilities technician to paste into a company work order system.

Write a 2–6 sentence note in past tense. State what was checked or inspected. State what was found. State what was done. If parts were actually used, mention them. If follow-up or additional parts are still needed, mention that. Do not exaggerate. Do not add filler phrases. Do not invent work that wasn't described. If information is missing, leave it out — do not make assumptions. Write like an experienced facilities technician wrote it, not like AI.

Examples of the correct tone and style:
- "Checked shower due to no hot water. Verified hot water supply to the valve and found the cartridge was not mixing properly. Shower will need a replacement cartridge to restore normal operation."
- "Patched damaged drywall where wall anchors were removed. Sanded repairs smooth and left the wall ready for paint."
- "Inspected sink after reports of a leak. Found the drain connection had loosened under the vanity. Tightened the fitting, tested operation, and confirmed no leaks at this time."

Job information:
${context}

Write only the work note. No labels, no headers, no explanation.`;
  }

  function hasEnoughInfoForWorkNote() {
    const hasChatText = (job.messages || []).some(m => m.content?.find(b => b.type === 'text')?.text?.trim());
    const hasPhotos = (job.messages || []).some(m => m._photoIds?.length > 0);
    const hasNotes = notes.trim().length > 0;
    const hasTitle = job.title?.trim().length > 0;
    return hasChatText || hasPhotos || hasNotes || hasTitle;
  }

  async function generateWorkNote() {
    if (!apiKey) { showToast('No API key — go to Settings', 'error'); return; }
    if (!hasEnoughInfoForWorkNote()) {
      setWorkNote('');
      showToast('Add job notes or photos before generating a work note.', 'error');
      return;
    }
    setWorkNoteGenerating(true);
    try {
      const result = await callAI(
        [{ role: 'user', content: [{ type: 'text', text: buildWorkNotePrompt() }] }],
        '',
        apiKey
      );
      const cleaned = result.trim();
      setWorkNote(cleaned);
      onUpdate({ workNote: cleaned });
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    setWorkNoteGenerating(false);
  }

  function save() {
    onUpdate({ finalNotes: notes, parts, partsNeeded, materials, workNote });
    setFlash(true); setTimeout(() => setFlash(false), 1800);
  }

  function addPart() {
    if (!newPart.name.trim()) return;
    setParts(prev => [...prev, { ...newPart, id: Date.now() }]);
    setNewPart({ name: '', partNumber: '', qty: 1, cost: '' });
  }
  function removePart(id) { setParts(prev => prev.filter(p => p.id !== id)); }

  function addNeeded() {
    if (!newNeeded.trim()) return;
    setPartsNeeded(prev => [...prev, { id: Date.now(), name: newNeeded.trim(), ordered: false }]);
    setNewNeeded('');
  }
  function toggleNeeded(id) { setPartsNeeded(prev => prev.map(p => p.id === id ? { ...p, ordered: !p.ordered } : p)); }
  function removeNeeded(id) { setPartsNeeded(prev => prev.filter(p => p.id !== id)); }

  function addMaterial() {
    if (!newMaterial.trim()) return;
    setMaterials(prev => [...prev, { id: Date.now(), name: newMaterial.trim(), done: false }]);
    setNewMaterial('');
  }
  function toggleMaterial(id) { setMaterials(prev => prev.map(m => m.id === id ? { ...m, done: !m.done } : m)); }
  function removeMaterial(id) { setMaterials(prev => prev.filter(m => m.id !== id)); }

  function exportFile() {
    const blob = new Blob([buildExportText({ ...job, finalNotes: notes, parts })], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `WO_${job.woNumber}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    showToast('Building PDF…', 'info');
    const ok = await downloadJobPDF({ ...job, finalNotes: notes, parts, partsNeeded, materials }, photos);
    if (!ok) showToast('PDF failed — try Download instead', 'error');
  }

  function shareNotes() {
    const text = buildExportText({ ...job, finalNotes: notes, parts });
    if (navigator.share) navigator.share({ title: `WO #${job.woNumber}`, text }).catch(() => {});
    else { navigator.clipboard.writeText(text); showToast('📋 Copied!', 'success'); }
  }

  const totalCost = parts.reduce((s, p) => s + (Number(p.cost || 0) * Number(p.qty || 1)), 0);

  const inputStyle = { background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: '8px 10px', fontSize: 13, color: T.text, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };

  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text }} className="app-min">
      {toast && <Toast message={toast.message} type={toast.type} onDone={hideToast} />}
      <Header
        left={<Btn ghost small onClick={onBack}>← Chat</Btn>}
        center={`WO #${job.woNumber} Notes`}
        right={<Btn small color={flash ? T.green : T.blue} onClick={save}>{flash ? '✓ Saved' : 'Save'}</Btn>}
      />
      <div style={{ padding: 14 }}>

        {/* WORK NOTE */}
        <Divider label="Work Note" />
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
            Short note for your work order system — 2–6 sentences, written the way you'd naturally write it.
          </div>
          {!hasEnoughInfoForWorkNote() && !workNote ? (
            <div style={{ fontSize: 13, color: T.muted, fontStyle: 'italic', marginBottom: 10, padding: '10px 12px', background: T.faint, borderRadius: 8, border: `1px solid ${T.border}` }}>
              Add job notes or photos before generating a work note.
            </div>
          ) : null}
          {workNote ? (
            <>
              <textarea
                value={workNote}
                onChange={e => { setWorkNote(e.target.value); onUpdate({ workNote: e.target.value }); }}
                rows={4}
                style={{
                  width: '100%', background: T.bg, border: `1px solid ${T.border}`,
                  borderRadius: 8, padding: '10px 12px', fontSize: 14, color: T.text,
                  resize: 'vertical', outline: 'none', lineHeight: 1.6, fontFamily: 'inherit',
                  boxSizing: 'border-box', marginBottom: 10,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn
                  onClick={() => { navigator.clipboard.writeText(workNote); showToast('✓ Work note copied!', 'success'); haptic('light'); }}
                  color={T.green}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  📋 Copy Work Note
                </Btn>
                <Btn
                  ghost
                  onClick={generateWorkNote}
                  disabled={workNoteGenerating}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {workNoteGenerating ? '⏳ Writing…' : '↺ Regenerate'}
                </Btn>
              </div>
            </>
          ) : (
            <Btn
              onClick={generateWorkNote}
              disabled={workNoteGenerating || !hasEnoughInfoForWorkNote()}
              color={T.blue}
              style={{ width: '100%', justifyContent: 'center', padding: 13, fontSize: 14 }}
            >
              {workNoteGenerating ? '⏳ Writing…' : '✦ Generate Work Note'}
            </Btn>
          )}
        </div>

        {/* AI format toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[{ k: true, l: 'Found / Fixed / Parts / Follow-Up' }, { k: false, l: 'Paragraph' }].map(o => (
            <button key={String(o.k)} onClick={() => setStructured(o.k)} style={{
              flex: 1, background: structured === o.k ? T.blue + '28' : 'transparent',
              color: structured === o.k ? T.blue : T.muted, border: `1px solid ${structured === o.k ? T.blue : T.border}`,
              borderRadius: 8, padding: '7px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>{o.l}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <Btn onClick={genFromChat} disabled={generating} color={T.blueDim} style={{ flex: 1, padding: 13, fontSize: 14, justifyContent: 'center' }}>
            {generating ? '⏳ Generating…' : (notes ? '✨ Regenerate' : '✨ Generate from chat')}
          </Btn>
        </div>

        <Textarea
          label="Work Order Completion Notes"
          right={notes ? `${wordCount(notes)} words` : undefined}
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="AI-generated notes will appear here, or write your own…"
          minHeight={220}
        />

        {notes && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <Btn ghost small onClick={() => { navigator.clipboard.writeText(notes); showToast('✓ Copied!', 'success'); haptic('light'); }} style={{ flex: 1, justifyContent: 'center', minWidth: 90 }}>📋 Copy</Btn>
            <Btn ghost small onClick={shareNotes} style={{ flex: 1, justifyContent: 'center', minWidth: 90 }}>📤 Share</Btn>
            <Btn ghost small onClick={exportPDF} style={{ flex: 1, justifyContent: 'center', minWidth: 90 }}>📄 PDF</Btn>
            <Btn ghost small onClick={exportFile} style={{ flex: 1, justifyContent: 'center', minWidth: 90 }}>💾 Text</Btn>
          </div>
        )}

        {/* PARTS USED */}
        <Divider label="Parts Used" />
        {parts.map(p => (
          <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: T.muted }}>
                {p.partNumber && `#${p.partNumber} · `}qty {p.qty}{p.cost ? ` · $${(Number(p.cost) * Number(p.qty)).toFixed(2)}` : ''}
              </div>
            </div>
            <button onClick={() => removePart(p.id)} style={{ background: 'transparent', border: 'none', color: T.red, cursor: 'pointer', fontSize: 18, padding: 4, fontFamily: 'inherit' }}>×</button>
          </div>
        ))}
        {parts.length > 0 && (
          <div style={{ textAlign: 'right', fontSize: 13, color: T.green, fontWeight: 700, marginBottom: 12 }}>Total: ${totalCost.toFixed(2)}</div>
        )}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Add Part Used</div>
          <input value={newPart.name} onChange={e => setNewPart(p => ({ ...p, name: e.target.value }))} placeholder="Part name" style={{ ...inputStyle, width: '100%', marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input value={newPart.partNumber} onChange={e => setNewPart(p => ({ ...p, partNumber: e.target.value }))} placeholder="Part # (optional)" style={{ ...inputStyle, flex: 2 }} />
            <input value={newPart.qty} onChange={e => setNewPart(p => ({ ...p, qty: e.target.value }))} placeholder="Qty" type="number" min="1" style={{ ...inputStyle, flex: 1 }} />
            <input value={newPart.cost} onChange={e => setNewPart(p => ({ ...p, cost: e.target.value }))} placeholder="$cost" type="number" step="0.01" style={{ ...inputStyle, flex: 1 }} />
          </div>
          <Btn full small onClick={addPart} disabled={!newPart.name.trim()}>+ Add Part</Btn>
        </div>

        {/* PARTS NEEDED */}
        <Divider label="Parts Needed / To Order" />
        {partsNeeded.map(p => (
          <div key={p.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => toggleNeeded(p.id)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${p.ordered ? T.green : T.border}`, background: p.ordered ? T.green : 'transparent', cursor: 'pointer', flexShrink: 0, color: '#fff', fontSize: 12, lineHeight: 1 }}>{p.ordered ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 13, textDecoration: p.ordered ? 'line-through' : 'none', color: p.ordered ? T.muted : T.text }}>{p.name}{p.ordered ? ' (ordered)' : ''}</span>
            <button onClick={() => removeNeeded(p.id)} style={{ background: 'transparent', border: 'none', color: T.red, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <input value={newNeeded} onChange={e => setNewNeeded(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNeeded()} placeholder="e.g. Flushmate cartridge" style={{ ...inputStyle, flex: 1 }} />
          <Btn small onClick={addNeeded} disabled={!newNeeded.trim()}>+ Add</Btn>
        </div>

        {/* MATERIALS CHECKLIST */}
        <Divider label="Material Checklist" />
        {materials.map(m => (
          <div key={m.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => toggleMaterial(m.id)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${m.done ? T.green : T.border}`, background: m.done ? T.green : 'transparent', cursor: 'pointer', flexShrink: 0, color: '#fff', fontSize: 12, lineHeight: 1 }}>{m.done ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 13, textDecoration: m.done ? 'line-through' : 'none', color: m.done ? T.muted : T.text }}>{m.name}</span>
            <button onClick={() => removeMaterial(m.id)} style={{ background: 'transparent', border: 'none', color: T.red, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <input value={newMaterial} onChange={e => setNewMaterial(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMaterial()} placeholder="e.g. Teflon tape, wire nuts" style={{ ...inputStyle, flex: 1 }} />
          <Btn small onClick={addMaterial} disabled={!newMaterial.trim()}>+ Add</Btn>
        </div>

        {/* PHOTO GALLERY */}
        {photos.length > 0 && (
          <>
            <Divider label={`Photos (${photos.length})`} />
            <PhotoGallery photos={photos} />
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
export function SettingsView({ onBack, settings, onSave }) {
  const [apiKey, setApiKey]         = useState(settings.apiKey || '');
  const [defaultLoc, setDefaultLoc] = useState(settings.defaultLocation || '');
  const [fontSize, setFontSize]     = useState(settings.fontSize || 'normal');
  const [autoComplete, setAutoComplete] = useState(settings.autoComplete || false);
  const [usage, setUsage]           = useState(null);
  const { toast, show: showToast, hide: hideToast } = useToast();

  useEffect(() => { estimateUsage().then(setUsage); }, []);

  function save() {
    onSave({ apiKey: apiKey.trim(), defaultLocation: defaultLoc.trim(), fontSize, autoComplete });
    showToast('✓ Settings saved', 'success');
  }

  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text, fontSize: fontSize === 'large' ? 16 : 14 }} className="app-min">
      {toast && <Toast message={toast.message} type={toast.type} onDone={hideToast} />}
      <Header left={<Btn ghost small onClick={onBack}>← Back</Btn>} center="Settings" right={<Btn small onClick={save}>Save</Btn>} />
      <div style={{ padding: '16px 16px 90px' }}>

        <div style={{ marginBottom: 20 }}>
          <Label>OpenAI API Key</Label>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..."
            type="password"
            style={{ background: T.bg, border: `1px solid ${apiKey ? T.green : T.border}`, borderRadius: 8, padding: '10px 13px', fontSize: 14, color: T.text, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }} />
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
            Get yours at platform.openai.com → API Keys. Stored locally, never sent anywhere except OpenAI.
          </div>
          {apiKey && <div style={{ fontSize: 11, color: T.green, marginTop: 4 }}>✓ API key set</div>}
        </div>

        <TextInput label="Default Location / Site" value={defaultLoc} onChange={e => setDefaultLoc(e.target.value)}
          placeholder="e.g. MGH Main Campus" hint="Pre-fills on every new job" />

        <div style={{ marginBottom: 16 }}>
          <Label>Text Size</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['normal', 'large'].map(s => (
              <button key={s} onClick={() => setFontSize(s)} style={{
                flex: 1, background: fontSize === s ? T.blue + '28' : 'transparent',
                color: fontSize === s ? T.blue : T.muted,
                border: `1px solid ${fontSize === s ? T.blue : T.border}`,
                borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
              }}>{s}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Auto-complete on notes save</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Mark job complete when you save final notes</div>
            </div>
            <button onClick={() => setAutoComplete(s => !s)} style={{
              width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer',
              background: autoComplete ? T.green : T.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: autoComplete ? 23 : 3, transition: 'left 0.2s' }} />
            </button>
          </div>
        </div>

        <Divider label="Storage" />
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          {usage ? (
            <>
              <div style={{ fontSize: 13, color: T.muted }}>Device storage used: <b style={{ color: T.text }}>{usage.usageMB} MB</b> of ~{usage.quotaMB} MB available</div>
              <div style={{ height: 5, background: T.border, borderRadius: 99, overflow: 'hidden', margin: '8px 0 6px' }}>
                <div style={{ width: `${usage.pct}%`, height: '100%', background: usage.pct > 85 ? T.red : T.green, borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>Photos now live in IndexedDB — you have hundreds of MB, not the old 5 MB limit.</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: T.muted }}>App data (text): <b style={{ color: T.text }}>{getStorageSize()} MB</b><div style={{ fontSize: 12, marginTop: 4 }}>Photos stored separately in IndexedDB.</div></div>
          )}
        </div>

        <Divider label="About" />
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
          Field Tracker v1.0 · Built for Dylan Boutin · Zampell Facilities<br />
          Powered by GPT-4o (OpenAI) · Photos compressed locally before upload<br />
          All data stored on this device only
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATES VIEW
// ═══════════════════════════════════════════════════════════════════════════════
export function TemplatesView({ onBack, templates, onSave }) {
  const [list, setList]     = useState(templates);
  const [editing, setEditing] = useState(null);
  const [name, setName]     = useState('');
  const [notes, setNotes]   = useState('');
  const [tags, setTags]     = useState([]);
  const [priority, setPriority] = useState('normal');

  function startNew() { setEditing('new'); setName(''); setNotes(''); setTags([]); setPriority('normal'); }

  function saveTemplate() {
    if (!name.trim()) return;
    const t = { id: editing === 'new' ? Date.now() : editing, name, notes, tags, priority };
    const updated = editing === 'new' ? [...list, t] : list.map(x => x.id === editing ? t : x);
    setList(updated); onSave(updated); setEditing(null);
  }

  function deleteTemplate(id) {
    const updated = list.filter(t => t.id !== id);
    setList(updated); onSave(updated);
  }

  if (editing !== null) return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text }} className="app-min">
      <Header
        left={<Btn ghost small onClick={() => setEditing(null)}>← Cancel</Btn>}
        center={editing === 'new' ? 'New Template' : 'Edit Template'}
        right={<Btn small onClick={saveTemplate}>Save</Btn>}
      />
      <div style={{ padding: '16px 16px 90px' }}>
        <TextInput label="Template Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Flushmate Rebuild" autoFocus />
        <div style={{ marginBottom: 14 }}>
          <Label>Default Priority</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PRIORITY_CFG).map(([key, cfg]) => (
              <button key={key} onClick={() => setPriority(key)} style={{
                flex: 1, background: priority === key ? cfg.color + '28' : 'transparent',
                color: priority === key ? cfg.color : T.muted,
                border: `1px solid ${priority === key ? cfg.color : T.border}`,
                borderRadius: 8, padding: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>{cfg.label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>Default Tags</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {JOB_TAGS.map(tag => (
              <button key={tag} onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])} style={{
                background: tags.includes(tag) ? T.blue + '28' : 'transparent',
                color: tags.includes(tag) ? T.blue : T.muted,
                border: `1px solid ${tags.includes(tag) ? T.blue : T.border}`,
                borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>{tag}</button>
            ))}
          </div>
        </div>
        <Textarea label="Pre-filled Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Notes that will pre-fill in the Notes tab for this job type…" minHeight={140} />
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text }} className="app-min">
      <Header left={<Btn ghost small onClick={onBack}>← Back</Btn>} center="Job Templates" right={<Btn small onClick={startNew}>+ New</Btn>} />
      <div style={{ padding: '14px 14px 90px' }}>
        {list.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: T.muted }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 600 }}>No templates yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Create templates for recurring job types</div>
          </div>
        )}
        {list.map(t => (
          <div key={t.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                {t.priority !== 'normal' && <span style={{ color: PRIORITY_CFG[t.priority]?.color }}>{PRIORITY_CFG[t.priority]?.label} · </span>}
                {t.tags?.join(', ')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn ghost small onClick={() => { setEditing(t.id); setName(t.name); setNotes(t.notes || ''); setTags(t.tags || []); setPriority(t.priority || 'normal'); }}>Edit</Btn>
              <Btn danger small onClick={() => deleteTemplate(t.id)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHOTO GALLERY (grid with category tags + lightbox)
// ═══════════════════════════════════════════════════════════════════════════════
export function PhotoGallery({ photos }) {
  const [box, setBox] = useState(null);
  const [filter, setFilter] = useState('all');
  const cats = ['all', ...PHOTO_CATEGORIES.map(c => c.key).filter(k => photos.some(p => p.category === k))];
  const shown = filter === 'all' ? photos : photos.filter(p => p.category === filter);

  return (
    <div style={{ marginBottom: 16 }}>
      {box && <Lightbox photoId={box} onClose={() => setBox(null)} />}
      {cats.length > 2 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
          {cats.map(c => {
            const cfg = PHOTO_CATEGORIES.find(x => x.key === c);
            const label = c === 'all' ? 'All' : cfg?.label || c;
            const color = c === 'all' ? T.muted : cfg?.color || T.muted;
            const on = filter === c;
            return (
              <button key={c} onClick={() => setFilter(c)} style={{
                background: on ? color + '28' : 'transparent', color: on ? color : T.muted,
                border: `1px solid ${on ? color : T.border}`, borderRadius: 99,
                padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
              }}>{label}</button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
        {shown.map(p => {
          const cfg = PHOTO_CATEGORIES.find(c => c.key === p.category) || PHOTO_CATEGORIES[5];
          return (
            <div key={p.id} style={{ position: 'relative' }}>
              <Photo id={p.id} onClick={() => setBox(p.id)}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}`, cursor: 'zoom-in', display: 'block' }} />
              <span style={{ position: 'absolute', bottom: 4, left: 4, background: cfg.color + 'cc', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
