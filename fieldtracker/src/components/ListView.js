import { useState, useRef } from 'react';
import { T, STATUS_CFG, PRIORITY_CFG, DATE_FILTERS } from '../utils/constants';
import { formatLastActivity, passesDateFilter, haptic, buildCSV } from '../utils/helpers';
import { Btn, Toast, Chip } from './UI';
import { useSwipe, usePullToRefresh, useToast } from '../hooks';

// ─── Swipeable card ───────────────────────────────────────────────────────────
function JobCard({ job, onOpen, onDelete, onComplete, onArchive, selected, onSelect, selectMode, isActive = false }) {
  const { offset, revealed, reset, onTouchStart, onTouchMove, onTouchEnd } = useSwipe();
  const st  = STATUS_CFG[job.status]  || STATUS_CFG.open;
  const pri = PRIORITY_CFG[job.priority] || PRIORITY_CFG.normal;
  const dur = job.startTime && job.endTime
    ? Math.round((job.endTime - job.startTime) / 60000) + 'm' : null;

  function handleTap() {
    if (selectMode) { onSelect(job.id); return; }
    if (revealed) { reset(); return; }
    onOpen(job.id);
  }

  return (
    <div style={{ position: 'relative', marginBottom: 10, overflow: 'hidden', borderRadius: 12 }}>
      {/* Action buttons */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'stretch', borderRadius: '0 12px 12px 0' }}>
        {job.status !== 'complete' && (
          <button onClick={() => { haptic('success'); onComplete(job.id); reset(); }}
            style={{ background: T.green, color: '#fff', border: 'none', width: 56, fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>✓</button>
        )}
        <button onClick={() => { haptic('light'); onArchive(job.id); reset(); }}
          style={{ background: T.muted, color: '#fff', border: 'none', width: 56, fontSize: 16, cursor: 'pointer' }}>📦</button>
        <button onClick={() => { haptic('medium'); onDelete(job.id); }}
          style={{ background: T.red, color: '#fff', border: 'none', width: 56, fontSize: 18, cursor: 'pointer', borderRadius: '0 12px 12px 0' }}>🗑</button>
      </div>

      {/* Card */}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onClick={handleTap}
        style={{
          background: isActive ? T.blue + '22' : selected ? T.blue + '18' : T.card,
          border: `1px solid ${isActive || selected ? T.blue : T.border}`,
          borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
          transform: `translateX(${offset}px)`,
          transition: 'transform 0.2s ease',
          position: 'relative', zIndex: 1,
        }}>
        {/* Priority indicator */}
        {job.priority !== 'normal' && (
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: pri.color, borderRadius: '12px 0 0 12px' }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, paddingLeft: job.priority !== 'normal' ? 8 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
              {job.title ? job.title : `WO #${job.woNumber}`}
              {job.pinnedMessageIdx !== null && job.pinnedMessageIdx !== undefined && <span title="Has pinned message">📌</span>}
              {job.followUpDate && new Date(job.followUpDate) < new Date() && <span title="Follow-up overdue" style={{ color: T.red }}>⚠️</span>}
            </div>
            {job.title && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>WO #{job.woNumber}</div>}
            {(() => {
              const place = [job.building, job.floor && `Fl ${job.floor}`, job.room && `Rm ${job.room}`].filter(Boolean).join(' · ') || job.location;
              return place ? <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>📍 {place}</div> : null;
            })()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
            <span style={{ background: st.color + '22', color: st.color, border: `1px solid ${st.color}44`, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99 }}>{st.label}</span>
            <span style={{ fontSize: 11, color: T.muted }}>{formatLastActivity(job.lastActivity || job.id)}</span>
          </div>
        </div>

        {/* Tags */}
        {job.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
            {job.tags.map(tag => <Chip key={tag} label={tag} color={T.blue} small />)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8, color: T.muted, fontSize: 12, flexWrap: 'wrap' }}>
          {job.messages?.length > 0 && <span>💬 {job.messages.length}</span>}
          {job.photoCount > 0 && <span>📷 {job.photoCount}</span>}
          {job.finalNotes && <span style={{ color: T.green }}>✓ Notes</span>}
          {dur && <span>⏱ {dur}</span>}
          {job.mileage && <span>🚗 {job.mileage}mi</span>}
          {job.parts?.length > 0 && <span>🔩 {job.parts.length} parts</span>}
        </div>

        {/* Select checkbox */}
        {selectMode && (
          <div style={{ position: 'absolute', top: 14, right: 14, width: 20, height: 20, borderRadius: 6, border: `2px solid ${selected ? T.blue : T.border}`, background: selected ? T.blue : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {selected && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ListView ────────────────────────────────────────────────────────────
export default function ListView({ jobs, onNew, onOpen, onDelete, onDeleteMany, onComplete, onMutate, activeId = null, compact = false }) {
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate]     = useState('all');
  const [filterTag, setFilterTag]       = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectMode, setSelectMode]     = useState(false);
  const [selected, setSelected]         = useState(new Set());
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { pullY, refreshing, onTouchStart, onTouchMove, onTouchEnd, THRESHOLD } = usePullToRefresh(async () => {
    haptic('light');
    await new Promise(r => setTimeout(r, 500));
    showToast('✓ Refreshed', 'success');
  });

  // Stats
  const active   = jobs.filter(j => !j.archived);
  const archived = jobs.filter(j => j.archived);
  const shown    = showArchived ? archived : active;
  const total    = active.length;
  const complete = active.filter(j => j.status === 'complete').length;
  const urgent   = active.filter(j => j.priority === 'urgent').length;
  const pct      = total ? Math.round((complete / total) * 100) : 0;

  // All tags from jobs
  const allTags = [...new Set(jobs.flatMap(j => j.tags || []))];

  const filtered = shown.filter(j => {
    const q = search.toLowerCase();
    return (filterStatus === 'all' || j.status === filterStatus)
      && passesDateFilter(j, filterDate)
      && (!filterTag || (j.tags || []).includes(filterTag))
      && (!q
        || j.woNumber.toLowerCase().includes(q)
        || (j.title || '').toLowerCase().includes(q)
        || (j.location || '').toLowerCase().includes(q)
        || (j.building || '').toLowerCase().includes(q)
        || (j.room || '').toLowerCase().includes(q)
        || (j.tags || []).some(t => t.toLowerCase().includes(q)));
  });

  function handleArchive(id) {
    onMutate(id, { archived: true });
    showToast('📦 Archived', 'info');
  }

  function handleDelete(id) {
    onDelete(id);
    showToast('Deleted', 'info');
  }

  function handleComplete(id) {
    onComplete(id);
    showToast('✓ Marked complete', 'success');
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function bulkComplete() {
    selected.forEach(id => onComplete(id));
    showToast(`✓ ${selected.size} jobs marked complete`, 'success');
    setSelected(new Set()); setSelectMode(false);
  }

  function bulkDelete() {
    if (!window.confirm(`Delete ${selected.size} work orders? This cannot be undone.`)) return;
    onDeleteMany([...selected]);
    showToast(`Deleted ${selected.size} jobs`, 'info');
    setSelected(new Set()); setSelectMode(false);
  }

  function bulkArchive() {
    selected.forEach(id => onMutate(id, { archived: true }));
    showToast(`📦 Archived ${selected.size} jobs`, 'info');
    setSelected(new Set()); setSelectMode(false);
  }

  function exportCSV() {
    const csv  = buildCSV(filtered);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'field-tracker-export.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('📊 CSV exported', 'success');
  }

  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', background: T.bg, color: T.text }} className="app-min"
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

      {toast && <Toast message={toast.message} type={toast.type} onDone={hideToast} />}

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>🔧 Field Tracker</div>
          <div style={{ fontSize: 11, color: T.muted }}>Zampell — MGB Sites</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn ghost small onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
            style={{ color: selectMode ? T.blue : T.muted, borderColor: selectMode ? T.blue : T.border }}>
            {selectMode ? 'Done' : '☑'}
          </Btn>
          <Btn onClick={onNew} small>+ New WO</Btn>
        </div>
      </div>

      {/* Pull indicator */}
      {(pullY > 0 || refreshing) && (
        <div style={{ textAlign: 'center', padding: '6px', color: T.muted, fontSize: 12, background: T.surface }}>
          {refreshing ? '⟳ Refreshing…' : pullY >= THRESHOLD ? '↑ Release to refresh' : '↓ Pull to refresh'}
        </div>
      )}

      {/* Stats bar */}
      {total > 0 && (
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: T.muted }}><b style={{ color: T.text }}>{total}</b> jobs</span>
          <span style={{ fontSize: 12, color: T.muted }}><b style={{ color: T.green }}>{complete}</b> done</span>
          {urgent > 0 && <span style={{ fontSize: 12, color: T.red }}><b>{urgent}</b> urgent</span>}
          <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: T.green, borderRadius: 99, transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 12, color: T.green, fontWeight: 700 }}>{pct}%</span>
          <button onClick={exportCSV} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 14, padding: 2 }} title="Export CSV">📊</button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectMode && selected.size > 0 && (
        <div style={{ background: T.blueDim + '22', borderBottom: `1px solid ${T.border}`, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: T.blue, fontWeight: 700, flex: 1 }}>{selected.size} selected</span>
          <Btn small onClick={bulkComplete} color={T.green}>✓ Complete</Btn>
          <Btn small onClick={bulkArchive} color={T.muted}>📦 Archive</Btn>
          <Btn small danger onClick={bulkDelete}>🗑 Delete</Btn>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '10px 14px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search WO # or location…"
          style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 13px', fontSize: 14, color: T.text, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }} />

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {['all', 'open', 'in-progress', 'waiting-parts', 'follow-up', 'complete'].map(s => {
            const cfg = s === 'all' ? { label: 'All', color: T.muted } : STATUS_CFG[s];
            const isActive = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                background: isActive ? cfg.color + '28' : 'transparent', color: isActive ? cfg.color : T.muted,
                border: `1px solid ${isActive ? cfg.color : T.border}`, borderRadius: 99,
                padding: '4px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
              }}>{cfg.label}</button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {DATE_FILTERS.map(({ key, label }) => {
            const isActive = filterDate === key;
            return (
              <button key={key} onClick={() => setFilterDate(key)} style={{
                background: isActive ? T.blue + '28' : 'transparent', color: isActive ? T.blue : T.muted,
                border: `1px solid ${isActive ? T.blue : T.border}`, borderRadius: 99,
                padding: '4px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
              }}>{label}</button>
            );
          })}
          {allTags.length > 0 && (
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
              style={{ background: filterTag ? T.blue + '28' : T.bg, color: filterTag ? T.blue : T.muted, border: `1px solid ${filterTag ? T.blue : T.border}`, borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">All Tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Archive toggle */}
      <div style={{ padding: '8px 14px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowArchived(s => !s)} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          {showArchived ? '← Active Jobs' : `📦 Archived (${archived.length})`}
        </button>
      </div>

      {/* List */}
      <div style={{ padding: '10px 14px 120px' }}>
        {jobs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '70px 20px', color: T.muted }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔧</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>No work orders yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Tap "+ New WO" to log your first job</div>
          </div>
        )}
        {filtered.length === 0 && jobs.length > 0 && (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: T.muted, fontSize: 13 }}>No results match your filters</div>
        )}
        {filtered.map(job => (
          <JobCard key={job.id} job={job} onOpen={onOpen} onDelete={handleDelete}
            onComplete={handleComplete} onArchive={handleArchive}
            selected={selected.has(job.id)} onSelect={toggleSelect} selectMode={selectMode}
            isActive={job.id === activeId} />
        ))}
        {filtered.length > 0 && !selectMode && (
          <div style={{ textAlign: 'center', fontSize: 11, color: T.faint + '80', marginTop: 4 }}>← Swipe left to complete, archive, or delete</div>
        )}
      </div>

    </div>
  );
}
