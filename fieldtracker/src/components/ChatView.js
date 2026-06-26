import { useState, useRef, useCallback, useEffect } from 'react';
import { T, SYSTEM_PROMPT, PHOTO_CATEGORIES, STATUS_CFG, STATUS_ORDER } from '../utils/constants';
import { haptic, formatTime, wordCount, fileToBase64, compressImage, saveDraft, loadDraft, buildExportText } from '../utils/helpers';
import { Btn, Toast, Lightbox, LoadingDots, Header, OfflineBanner, Photo } from './UI';
import { useVoice, useAutoResize, useToast } from '../hooks';
import { callAI } from '../utils/helpers';
import { putPhoto, getPhoto, newPhotoId } from '../utils/photoStore';

export default function ChatView({ job, onUpdate, onBack, onDelete, onNotes, onEdit, apiKey, hideBack = false }) {
  const [input, setInput]         = useState(() => loadDraft(job.id));
  const [staged, setStaged]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [streaming, setStreaming] = useState('');
  const [status, setStatus]       = useState(job.status);
  const [lightbox, setLightbox]   = useState(null);
  const [genBusy, setGenBusy]     = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const { toast, show: showToast, hide: hideToast } = useToast();

  const bottomRef = useRef();
  const fileRef   = useRef();
  const taRef     = useAutoResize(input);

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  // Auto-save draft
  useEffect(() => {
    const t = setTimeout(() => saveDraft(job.id, input), 800);
    return () => clearTimeout(t);
  }, [input, job.id]);

  // Voice
  const { listening, toggle: toggleVoice } = useVoice(
    useCallback(transcript => {
      setInput(prev => prev ? prev + ' ' + transcript : transcript);
      taRef.current?.focus();
    }, [taRef])
  );

  // Build system prompt with job context
  function getSystemPrompt() {
    const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || 'Not specified';
    const equip = job.equipment && (job.equipment.brand || job.equipment.model)
      ? `\nEquipment: ${[job.equipment.brand, job.equipment.model, job.equipment.serial && `S/N ${job.equipment.serial}`].filter(Boolean).join(' ')}` : '';
    return `${SYSTEM_PROMPT}\n\nCURRENT JOB:\nWork Order: #${job.woNumber}${job.title ? `\nJob: ${job.title}` : ''}\nLocation: ${place}\nStatus: ${job.status}\nPriority: ${job.priority || 'normal'}\nTags: ${(job.tags || []).join(', ') || 'None'}${equip}`;
  }

  async function send(overrideText = null) {
    const text = (overrideText ?? input).trim();
    if (!text && staged.length === 0) return;
    if (!apiKey) { showToast('⚠️ No API key — go to Settings', 'error'); return; }

    haptic('light');
    saveDraft(job.id, '');

    const ts = Date.now();

    // Persist each staged photo to IndexedDB; keep only IDs on the message.
    const photoIds = [];
    for (const p of staged) {
      const pid = newPhotoId();
      const ok = await putPhoto(pid, { data: p.data, mime: p.mime, category: p.category || 'other', caption: p.caption || '' });
      if (ok) photoIds.push(pid);
    }

    // Build the API content (needs full base64 — this is NOT persisted to LS).
    const userContent = [];
    for (const p of staged) {
      userContent.push({ type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data}`, detail: 'auto' } });
    }
    if (text) userContent.push({ type: 'text', text });

    // The stored message keeps text + photo IDs only (no base64, no full preview).
    const storedContent = text ? [{ type: 'text', text }] : [];
    const userMsg  = { role: 'user', content: storedContent, _photoIds: photoIds, _ts: ts };
    const nextMsgs = [...(job.messages || []), userMsg];
    onUpdate({ messages: nextMsgs, photoCount: (job.photoCount || 0) + photoIds.length });
    setInput(''); setStaged([]); setLoading(true); setStreaming(''); scrollBottom();

    try {
      // Reconstruct API messages: rehydrate any photo IDs from IDB into base64.
      const apiMsgs = await Promise.all(nextMsgs.map(async (m) => {
        const content = [...(m.content || [])];
        if (m === userMsg) {
          // current turn: we already have base64 in memory
          return { role: m.role, content: userContent };
        }
        if (m._photoIds?.length) {
          const imgs = [];
          for (const pid of m._photoIds) {
            const rec = await getPhoto(pid);
            if (rec) imgs.push({ type: 'image_url', image_url: { url: `data:${rec.mime};base64,${rec.data}`, detail: 'auto' } });
          }
          return { role: m.role, content: [...imgs, ...content] };
        }
        return { role: m.role, content };
      }));

      let full = '';
      await callAI(apiMsgs, getSystemPrompt(), apiKey, chunk => {
        full = chunk;
        setStreaming(chunk);
        scrollBottom();
      });
      setStreaming('');
      const aiMsg = { role: 'assistant', content: [{ type: 'text', text: full }], _ts: Date.now() };
      onUpdate({ messages: [...nextMsgs, aiMsg] });
      setShowSuggest(true);
    } catch (e) {
      setStreaming('');
      const errMsg = { role: 'assistant', content: [{ type: 'text', text: `⚠️ ${e.message}` }], _ts: Date.now(), _error: true };
      onUpdate({ messages: [...nextMsgs, errMsg] });
      showToast('AI error — tap the message to retry', 'error');
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

  async function quickNotes() {
    const msgs = job.messages || [];
    if (!msgs.length) { showToast('Start chatting first', 'error'); return; }
    if (!apiKey) { showToast('No API key — go to Settings', 'error'); return; }
    setGenBusy(true);
    try {
      const history = msgs.map(m => {
        const role = m.role === 'user' ? 'Technician' : 'AI';
        const text = m.content?.find(b => b.type === 'text')?.text || '';
        const ph   = (m._photoIds?.length || 0) > 0 ? `[${m._photoIds.length} photo(s)]` : '';
        return `${role}: ${[ph, text].filter(Boolean).join(' ')}`;
      }).join('\n');

      const prompt = `Write professional work order completion notes for WO #${job.woNumber}${job.location ? ' at ' + job.location : ''}.\n\nChat:\n${history}\n\nParagraph format. What was found, what was performed, materials used, follow-up needed. Professional, suitable for facilities management submission.`;
      const notes = await callAI([{ role: 'user', content: [{ type: 'text', text: prompt }] }], SYSTEM_PROMPT, apiKey);
      onUpdate({ finalNotes: notes });
      const preview = { role: 'assistant', content: [{ type: 'text', text: `📋 **Notes Generated & Saved**\n\n${notes}` }], _ts: Date.now() };
      onUpdate({ messages: [...(job.messages || []), preview] });
      scrollBottom();
      showToast('✓ Notes saved to Notes tab', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    setGenBusy(false);
  }

  async function extractParts() {
    const msgs = job.messages || [];
    if (!msgs.length || !apiKey) return;
    try {
      const history = msgs.map(m => m.content?.find(b => b.type === 'text')?.text || '').join('\n');
      const result  = await callAI([{ role: 'user', content: [{ type: 'text', text: `Extract every part, material, or supply mentioned in this work order conversation as a JSON array. Each item: { "name": string, "partNumber": string|null, "qty": number, "supplier": string|null }.\n\nConversation:\n${history}\n\nReturn only valid JSON array, nothing else.` }] }], '', apiKey);
      const raw = JSON.parse(result.replace(/```json|```/g, '').trim());
      const parts = (Array.isArray(raw) ? raw : []).map((p, i) => ({
        id: Date.now() + i,
        name: p.name || 'Unknown part',
        partNumber: p.partNumber || '',
        qty: Number(p.qty) || 1,
        cost: p.cost ? Number(p.cost) : '',
        supplier: p.supplier || '',
      }));
      onUpdate({ parts: [...(job.parts || []), ...parts] });
      showToast(`✓ ${parts.length} parts extracted`, 'success');
    } catch { showToast('Could not extract parts', 'error'); }
  }

  async function summarizeJob() {
    if (!job.messages?.length || !apiKey) return;
    try {
      const history = job.messages.map(m => m.content?.find(b => b.type === 'text')?.text || '').join('\n');
      const summary = await callAI([{ role: 'user', content: [{ type: 'text', text: `Summarize this work order conversation in 2 sentences max:\n\n${history}` }] }], '', apiKey);
      const msg = { role: 'assistant', content: [{ type: 'text', text: `📝 **Job Summary:**\n${summary}` }], _ts: Date.now() };
      onUpdate({ messages: [...(job.messages || []), msg] });
      scrollBottom();
    } catch { showToast('Error summarizing', 'error'); }
  }

  async function pickPhotos(e) {
    const files  = Array.from(e.target.files);
    const compressed = await Promise.all(files.map(compressImage));
    const loaded = await Promise.all(compressed.map(fileToBase64));
    setStaged(prev => [...prev, ...loaded.map(p => ({ ...p, category: 'other' }))]);
    e.target.value = '';
  }

  function pinMessage(idx) {
    onUpdate({ pinnedMessageIdx: job.pinnedMessageIdx === idx ? null : idx });
    showToast(job.pinnedMessageIdx === idx ? 'Unpinned' : '📌 Pinned', 'info');
  }

  function copyMsg(text) {
    navigator.clipboard.writeText(text);
    showToast('✓ Copied', 'success');
    haptic('light');
  }

  function changeStatus(s) {
    setStatus(s);
    onUpdate({ status: s });
    if (s === 'complete' && !job.endTime) onUpdate({ endTime: Date.now() });
    if (s === 'in-progress' && !job.startTime) onUpdate({ startTime: Date.now() });
  }

  function handleBack() {
    if (input.trim() && !window.confirm('You have an unsent message. Leave anyway?')) return;
    saveDraft(job.id, '');
    onBack();
  }

  function shareNotes() {
    const text = buildExportText(job);
    if (navigator.share) {
      navigator.share({ title: `WO #${job.woNumber}`, text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      showToast('📋 Copied to clipboard', 'success');
    }
  }

  const msgs = job.messages || [];
  const pinnedMsg = job.pinnedMessageIdx !== null && job.pinnedMessageIdx !== undefined ? msgs[job.pinnedMessageIdx] : null;
  const pinnedText = pinnedMsg?.content?.find(b => b.type === 'text')?.text || '';

  const suggestedFollowUps = [
    'What parts do I need? Give me Grainger numbers.',
    'Write my work order notes from this conversation.',
    'Are there any safety concerns I should note?',
    'What should I check before closing this out?',
  ];

  return (
    <div className={hideBack ? '' : 'app-fill'} style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text, display: 'flex', flexDirection: 'column', height: hideBack ? '100%' : undefined }}>
      {lightbox && <Lightbox photoId={lightbox} onClose={() => setLightbox(null)} />}
      {toast    && <Toast message={toast.message} type={toast.type} onDone={hideToast} />}

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        {hideBack
          ? <div style={{ minWidth: 60 }} />
          : <Btn ghost small onClick={handleBack}>← Jobs</Btn>}
        <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }} onClick={() => setMenuOpen(m => !m)}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{job.title ? job.title : `WO #${job.woNumber}`} ✎</div>
          <div style={{ fontSize: 11, color: T.muted }}>
            {job.title ? `WO #${job.woNumber}` : ''}{job.title && (job.location || job.room) ? ' · ' : ''}{[job.building, job.floor, job.room].filter(Boolean).join(' ') || job.location || ''}
          </div>
        </div>
        <Btn ghost small onClick={onNotes}>📋 Notes</Btn>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Btn small ghost onClick={() => { setMenuOpen(false); onEdit(); }}>✎ Edit Info</Btn>
          <Btn small ghost onClick={() => { setMenuOpen(false); extractParts(); }}>🔩 Extract Parts</Btn>
          <Btn small ghost onClick={() => { setMenuOpen(false); summarizeJob(); }}>📝 Summarize</Btn>
          <Btn small ghost onClick={() => { setMenuOpen(false); shareNotes(); }}>📤 Share</Btn>
          <Btn small danger onClick={() => { setMenuOpen(false); onDelete(); }}>🗑 Delete</Btn>
        </div>
      )}

      <OfflineBanner />

      {/* Status strip */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '7px 13px', display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
        {STATUS_ORDER.map(s => {
          const cfg = STATUS_CFG[s];
          return (
            <button key={s} onClick={() => { haptic('light'); changeStatus(s); }} style={{
              background: status === s ? cfg.color + '28' : 'transparent', color: status === s ? cfg.color : T.muted,
              border: `1px solid ${status === s ? cfg.color : T.border}`, borderRadius: 99,
              padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            }}>{cfg.label}</button>
          );
        })}
        <button onClick={quickNotes} disabled={genBusy} style={{
          marginLeft: 'auto', background: genBusy ? T.faint : T.blueDim + '44',
          color: genBusy ? T.muted : T.blue, border: `1px solid ${T.blueDim}`,
          borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700,
          cursor: genBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
        }}>{genBusy ? '⏳ Writing…' : '✨ Write Notes'}</button>
      </div>

      {/* Pinned message */}
      {pinnedText && (
        <div style={{ background: T.yellow + '11', borderBottom: `1px solid ${T.yellow}33`, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 14 }}>📌</span>
          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, flex: 1 }}>{pinnedText.substring(0, 120)}{pinnedText.length > 120 ? '…' : ''}</div>
          <button onClick={() => pinMessage(job.pinnedMessageIdx)} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 13px 4px' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: T.muted }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Chat with AI about WO #{job.woNumber}</div>
            <div style={{ fontSize: 12, marginBottom: 18 }}>Upload photos, use voice 🎤, ask questions — all saved here</div>
            {['What\'s wrong here? Walk me through the fix.', 'What parts do I need? Grainger numbers if possible.', 'Write my work order notes.'].map(q => (
              <button key={q} onClick={() => { setInput(q); taRef.current?.focus(); }} style={{
                display: 'block', width: '100%', textAlign: 'left', background: T.card,
                border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 13px',
                color: T.muted, cursor: 'pointer', fontSize: 13, marginBottom: 8, fontFamily: 'inherit',
              }}>{q}</button>
            ))}
          </div>
        )}

        {msgs.map((msg, i) => {
          const isUser   = msg.role === 'user';
          const text     = msg.content?.find(b => b.type === 'text')?.text || '';
          const photoIds = msg._photoIds || [];
          const isPinned = job.pinnedMessageIdx === i;
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
                    border: `1px solid ${isUser ? '#1e40af' : isPinned ? T.yellow + '44' : T.border}`,
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    padding: '10px 14px', lineHeight: 1.65, fontSize: 14,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    opacity: msg._error ? 0.7 : 1,
                  }}>{text}</div>
                  {!isUser && (
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <button onClick={() => copyMsg(text)} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: 5, color: T.muted, fontSize: 10, padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>copy</button>
                      <button onClick={() => pinMessage(i)} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: 5, color: isPinned ? T.yellow : T.muted, fontSize: 10, padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>📌</button>
                    </div>
                  )}
                  {msg._error && (
                    <button onClick={() => retryMessage(i)} style={{ marginTop: 4, background: 'transparent', border: `1px solid ${T.red}`, borderRadius: 6, color: T.red, fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>↺ Retry</button>
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, color: T.muted, marginTop: 3, display: 'flex', gap: 6 }}>
                <span>{isUser ? 'You' : 'AI Assistant'}</span>
                {msg._ts && <span>· {formatTime(msg._ts)}</span>}
              </div>
            </div>
          );
        })}

        {/* Streaming */}
        {streaming && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: '14px 14px 14px 4px', padding: '10px 14px', maxWidth: '88%', lineHeight: 1.65, fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {streaming}<span style={{ opacity: 0.5 }}>▊</span>
            </div>
          </div>
        )}

        {loading && !streaming && (
          <div style={{ display: 'flex', marginBottom: 14 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: '14px 14px 14px 4px', padding: '12px 16px' }}>
              <LoadingDots />
            </div>
          </div>
        )}

        {/* Suggested follow-ups */}
        {showSuggest && !loading && msgs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Suggested:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {suggestedFollowUps.map(s => (
                <button key={s} onClick={() => { setShowSuggest(false); send(s); }} style={{
                  background: T.card, border: `1px solid ${T.border}`, borderRadius: 20,
                  padding: '5px 11px', fontSize: 12, color: T.muted, cursor: 'pointer', fontFamily: 'inherit',
                }}>{s}</button>
              ))}
              <button onClick={() => setShowSuggest(false)} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </div>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {/* Staged photos */}
      {staged.length > 0 && (
        <div style={{ background: T.surface, borderTop: `1px solid ${T.border}`, padding: '8px 13px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {staged.map((p, i) => {
            const cat = PHOTO_CATEGORIES.find(c => c.key === (p.category || 'other')) || PHOTO_CATEGORIES[5];
            const cycleCat = () => setStaged(prev => prev.map((s, j) => {
              if (j !== i) return s;
              const idx = PHOTO_CATEGORIES.findIndex(c => c.key === (s.category || 'other'));
              return { ...s, category: PHOTO_CATEGORIES[(idx + 1) % PHOTO_CATEGORIES.length].key };
            }));
            return (
              <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                <img src={p.preview} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}` }} />
                <button onClick={cycleCat} title="Tap to change category" style={{
                  background: cat.color + '22', color: cat.color, border: `1px solid ${cat.color}55`,
                  borderRadius: 99, padding: '1px 7px', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>{cat.label}</button>
                <button onClick={() => setStaged(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -5, right: -5, background: T.red, color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit' }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Draft indicator */}
      {input.trim() && (
        <div style={{ background: T.surface, padding: '3px 14px', fontSize: 11, color: T.muted, borderTop: `1px solid ${T.border}` }}>
          Draft autosaved · {wordCount(input)} word{wordCount(input) !== 1 ? 's' : ''}
        </div>
      )}

      {/* Input bar */}
      <div style={{ background: T.surface, borderTop: `1px solid ${T.border}`, padding: '10px 12px', display: 'flex', gap: 7, alignItems: 'flex-end' }}>
        <button onClick={() => fileRef.current.click()} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 11px', cursor: 'pointer', color: T.muted, fontSize: 18, flexShrink: 0, lineHeight: 1, fontFamily: 'inherit' }}>📷</button>
        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }} onChange={pickPhotos} />
        <button onClick={toggleVoice} style={{
          background: listening ? T.red + '33' : T.card,
          border: `1px solid ${listening ? T.red : T.border}`,
          borderRadius: 8, padding: '9px 11px', cursor: 'pointer',
          color: listening ? T.red : T.muted, fontSize: 18, flexShrink: 0, lineHeight: 1, fontFamily: 'inherit',
          animation: listening ? 'pulse 1s infinite' : 'none',
        }}>🎤</button>
        <textarea ref={taRef} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={listening ? '🎤 Listening…' : 'Ask anything or describe what you did…'}
          rows={1}
          style={{
            flex: 1, background: T.bg, border: `1px solid ${listening ? T.red : T.border}`,
            borderRadius: 8, padding: '10px 12px', fontSize: 14, color: T.text,
            resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: 120, fontFamily: 'inherit',
            transition: 'border-color 0.2s',
          }}
        />
        <button onClick={() => send()} disabled={loading || (!input.trim() && staged.length === 0)}
          style={{
            background: T.blue, border: 'none', borderRadius: 8, padding: '9px 13px',
            cursor: 'pointer', color: '#fff', fontSize: 20, flexShrink: 0, lineHeight: 1, fontFamily: 'inherit',
            opacity: (loading || (!input.trim() && staged.length === 0)) ? 0.35 : 1,
          }}>↑</button>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}
