// ─── Storage ──────────────────────────────────────────────────────────────────
const JOBS_KEY    = 'zampell_jobs_v5';
const SETTINGS_KEY = 'zampell_settings_v1';
const TEMPLATES_KEY = 'zampell_templates_v1';

export function loadJobs()      {
  try {
    const raw = JSON.parse(localStorage.getItem(JOBS_KEY)) || [];
    // Backfill fields added in later versions so older saved jobs don't crash.
    return raw.map(j => ({
      title: '', building: '', floor: '', room: '',
      partsNeeded: [], materials: [],
      equipment: { brand: '', model: '', serial: '' },
      workNote: '',
      ...j,
      equipment: { brand: '', model: '', serial: '', ...(j.equipment || {}) },
    }));
  } catch { return []; }
}
export function persistJobs(j)  { try { localStorage.setItem(JOBS_KEY, JSON.stringify(j));          } catch {} }
export function loadSettings()  {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch { return {}; }
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));      } catch {} }
export function loadTemplates() { try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || []; } catch { return []; } }
export function saveTemplates(t){ try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));     } catch {} }
export function loadDraft(id)   { try { return localStorage.getItem(`draft_${id}`) || '';           } catch { return ''; } }
export function saveDraft(id, t){ try { if (t) localStorage.setItem(`draft_${id}`, t); else localStorage.removeItem(`draft_${id}`); } catch {} }

export function getStorageSize() {
  try {
    let total = 0;
    for (const key of Object.keys(localStorage)) {
      total += (localStorage.getItem(key) || '').length * 2;
    }
    return (total / 1024 / 1024).toFixed(2);
  } catch { return '0'; }
}

// ─── Job factory ──────────────────────────────────────────────────────────────
export function makeJob(woNumber, location, overrides = {}) {
  const now = Date.now();
  return {
    id: now,
    woNumber,
    title: '',
    location,
    building: '',
    floor: '',
    room: '',
    status: 'open',
    priority: 'normal',
    tags: [],
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    lastActivity: now,
    startTime: null,
    endTime: null,
    messages: [],
    finalNotes: '',
    photoCount: 0,
    parts: [],
    partsNeeded: [],
    materials: [],
    equipment: { brand: '', model: '', serial: '' },
    costs: [],
    mileage: null,
    linkedJobs: [],
    pinnedMessageIdx: null,
    archived: false,
    signature: null,
    followUpDate: null,
    workNote: '',
    ...overrides,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatLastActivity(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return formatTime(ts);
}

export function formatDuration(start, end) {
  if (!start || !end) return null;
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function cleanWoNumber(raw) {
  return raw.replace(/[^a-zA-Z0-9\-]/g, '').toUpperCase();
}

export function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ─── Haptic ───────────────────────────────────────────────────────────────────
export function haptic(type = 'light') {
  try {
    if (!navigator.vibrate) return;
    const p = { light: [10], medium: [20], success: [10, 50, 10], error: [50, 30, 50] };
    navigator.vibrate(p[type] || [10]);
  } catch {}
}

// ─── File helpers ─────────────────────────────────────────────────────────────
export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ data: r.result.split(',')[1], mime: file.type, name: file.name, preview: r.result });
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function compressImage(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        const compressed = new File([blob], file.name, { type: 'image/jpeg' });
        res(compressed);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}

// ─── Date filter ─────────────────────────────────────────────────────────────
export function passesDateFilter(job, filter) {
  if (filter === 'all') return true;
  const la  = job.lastActivity || job.id;
  const now = Date.now();
  if (filter === 'today') return (now - la) < 86400000;
  if (filter === 'week')  return (now - la) < 604800000;
  if (filter === 'month') return (now - la) < 2592000000;
  return true;
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function buildExportText(job) {
  const dur = formatDuration(job.startTime, job.endTime);
  const place = [job.building, job.floor && `Floor ${job.floor}`, job.room && `Room ${job.room}`].filter(Boolean).join(', ') || job.location || 'N/A';
  const lines = [
    `WORK ORDER: #${job.woNumber}`,
    job.title ? `TITLE: ${job.title}` : null,
    `DATE: ${job.date}`,
    `LOCATION: ${place}`,
    `STATUS: ${job.status}`,
    `PRIORITY: ${job.priority || 'normal'}`,
    dur ? `DURATION: ${dur}` : null,
    job.mileage ? `MILEAGE: ${job.mileage} miles` : null,
    job.tags?.length ? `TAGS: ${job.tags.join(', ')}` : null,
    '',
    '─── COMPLETION NOTES ───────────────────────────────────',
    job.finalNotes || '(no notes saved)',
    '',
    job.parts?.length ? '─── PARTS USED ─────────────────────────────────────────' : null,
    ...(job.parts || []).map(p => `• ${p.name}${p.partNumber ? ` (${p.partNumber})` : ''}${p.qty > 1 ? ` x${p.qty}` : ''}${p.cost ? ` — $${p.cost}` : ''}`),
    job.parts?.length ? '' : null,
    job.costs?.length ? `TOTAL COST: $${job.costs.reduce((s, c) => s + Number(c.amount || 0), 0).toFixed(2)}` : null,
    '',
    '─── CHAT HISTORY ───────────────────────────────────────',
    ...(job.messages || []).map(m => {
      const role = m.role === 'user' ? 'TECH' : 'AI';
      const text = m.content?.find(b => b.type === 'text')?.text || '';
      const ph   = (m._photoIds?.length || 0) > 0 ? `[${m._photoIds.length} photo(s)] ` : '';
      const ts   = m._ts ? ` [${formatTime(m._ts)}]` : '';
      return `[${role}${ts}] ${ph}${text}`;
    }),
  ].filter(l => l !== null);
  return lines.join('\n');
}

// ─── CSV export ───────────────────────────────────────────────────────────────
export function buildCSV(jobs) {
  const header = ['WO Number','Title','Location','Building','Floor','Room','Status','Priority','Date','Last Activity','Photos','Messages','Has Notes','Tags','Duration','Mileage'];
  const rows = jobs.map(j => [
    j.woNumber, j.title || '', j.location || '', j.building || '', j.floor || '', j.room || '',
    j.status, j.priority || 'normal',
    j.date, j.lastActivity ? new Date(j.lastActivity).toLocaleString() : '',
    j.photoCount || 0, j.messages?.length || 0,
    j.finalNotes ? 'Yes' : 'No',
    (j.tags || []).join('; '),
    formatDuration(j.startTime, j.endTime) || '',
    j.mileage || '',
  ]);
  return [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// ─── AI API (OpenAI) ──────────────────────────────────────────────────────────
export async function callAI(messages, systemPrompt, apiKey, onChunk) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 1200,
      stream: !!onChunk,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  if (onChunk) {
    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let full = '';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete trailing line for next chunk
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
        try {
          const delta = JSON.parse(trimmed.slice(6)).choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; onChunk(full); }
        } catch {}
      }
    }
    return full;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
