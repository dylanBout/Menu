import { useState, useEffect } from 'react';
import { loadJobs, persistJobs, loadSettings, saveSettings, loadTemplates, saveTemplates, makeJob } from './utils/helpers';
import { pruneOrphans } from './utils/photoStore';
import { useViewport } from './hooks';
import { T } from './utils/constants';
import ListView from './components/ListView';
import ChatView from './components/ChatView';
import { NewJobView, EditJobView, NotesView, SettingsView, TemplatesView } from './components/Views';

export default function App() {
  const [jobs, setJobs]         = useState(loadJobs);
  const [settings, setSettings] = useState(loadSettings);
  const [templates, setTemplates] = useState(loadTemplates);
  const [view, setView]         = useState('list');
  const [activeId, setActiveId] = useState(null);
  const { wide } = useViewport();

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const active = jobs.find(j => j.id === activeId) || null;

  const go = (v, id = null) => { setView(v); if (id !== null) setActiveId(id); };

  function mutate(id, patch) {
    setJobs(prev => {
      const next = prev.map(j => j.id === id ? { ...j, ...patch, lastActivity: Date.now() } : j);
      persistJobs(next);
      return next;
    });
  }

  function createJob(woNumber, location, overrides = {}) {
    const job  = makeJob(woNumber, location, overrides);
    const next = [job, ...jobs];
    setJobs(next); persistJobs(next);
    return job.id;
  }

  function deleteJob(id) {
    if (!window.confirm('Delete this work order? This cannot be undone.')) return;
    const next = jobs.filter(j => j.id !== id);
    setJobs(next); persistJobs(next);
    pruneOrphans(next); // remove this job's photos from IndexedDB
    if (activeId === id) setView('list');
  }

  // No per-item confirm — caller (bulk actions) confirms once for the whole set.
  function deleteJobs(ids) {
    const set = new Set(ids);
    const next = jobs.filter(j => !set.has(j.id));
    setJobs(next); persistJobs(next);
    pruneOrphans(next);
    if (set.has(activeId)) setView('list');
  }

  function completeJob(id) {
    setJobs(prev => {
      const next = prev.map(j => j.id === id ? { ...j, status: 'complete', endTime: j.endTime || Date.now(), lastActivity: Date.now() } : j);
      persistJobs(next);
      return next;
    });
  }

  function duplicateJob(id) {
    const src  = jobs.find(j => j.id === id);
    if (!src) return;
    const copy = makeJob(src.woNumber + '-COPY', src.location, {
      priority: src.priority, tags: src.tags, finalNotes: src.finalNotes,
    });
    const next = [copy, ...jobs];
    setJobs(next); persistJobs(next);
    go('chat', copy.id);
  }

  function saveSettingsAndBack(s) {
    setSettings(s); saveSettings(s); setView('list');
  }

  function saveTemplatesAndContinue(t) {
    setTemplates(t); saveTemplates(t);
  }

  // ─── View composition ──────────────────────────────────────────────────────
  // The list is always available. In wide (Fold open) mode it lives in a left
  // pane and the "active" view fills the right pane. In narrow (cover screen)
  // mode we show a single full-screen view at a time, exactly as before.

  const listPane = (
    <ListView
      jobs={jobs}
      onNew={() => go('new')}
      onOpen={id => go('chat', id)}
      onDelete={deleteJob}
      onDeleteMany={deleteJobs}
      onComplete={completeJob}
      onMutate={mutate}
      onSettings={() => go('settings')}
      onTemplates={() => go('templates')}
      activeId={wide ? activeId : null}
      compact={wide}
    />
  );

  // In wide mode, "back" from a job-level view returns to the empty right pane
  // (the list stays visible on the left) instead of replacing the whole screen.
  const backToList = () => (wide ? go('list', null) : setView('list'));

  function renderActiveView() {
    switch (view) {
      case 'new':
        return (
          <NewJobView
            onBack={backToList}
            onCreate={(wo, loc, overrides) => { const id = createJob(wo, loc, overrides); go('chat', id); }}
            templates={templates}
            defaultLocation={settings.defaultLocation || ''}
          />
        );

      case 'chat':
        if (!active) return wide ? <EmptyPane onNew={() => go('new')} /> : (backToList(), null);
        return (
          <ChatView
            key={active.id}
            job={active}
            onUpdate={p => mutate(active.id, p)}
            onBack={backToList}
            onDelete={() => { deleteJob(active.id); }}
            onNotes={() => go('notes')}
            onEdit={() => go('edit')}
            apiKey={settings.apiKey || ''}
            hideBack={wide}
          />
        );

      case 'notes':
        if (!active) return wide ? <EmptyPane onNew={() => go('new')} /> : (backToList(), null);
        return (
          <NotesView
            job={active}
            onUpdate={p => {
              mutate(active.id, p);
              if (settings.autoComplete && p.finalNotes) {
                mutate(active.id, { status: 'complete', endTime: Date.now() });
              }
            }}
            onBack={() => go('chat')}
            apiKey={settings.apiKey || ''}
          />
        );

      case 'edit':
        if (!active) return wide ? <EmptyPane onNew={() => go('new')} /> : (backToList(), null);
        return (
          <EditJobView
            job={active}
            onSave={p => { mutate(active.id, p); go('chat'); }}
            onBack={() => go('chat')}
          />
        );

      case 'settings':
        return <SettingsView onBack={backToList} settings={settings} onSave={saveSettingsAndBack} />;

      case 'templates':
        return <TemplatesView onBack={backToList} templates={templates} onSave={saveTemplatesAndContinue} />;

      case 'list':
      default:
        return <EmptyPane onNew={() => go('new')} />;
    }
  }

  // ─── Wide (Fold open): two panes side by side ───────────────────────────────
  if (wide) {
    return (
      <div className="app-fill" style={{ display: 'flex', background: T.bg, color: T.text, fontFamily: 'Inter,system-ui,sans-serif', overflow: 'hidden' }}>
        <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${T.border}`, height: '100%', overflowY: 'auto' }}>
          {listPane}
        </div>
        <div style={{ flex: 1, height: '100%', overflowY: 'auto', position: 'relative' }}>
          {renderActiveView()}
        </div>
      </div>
    );
  }

  // ─── Narrow (cover screen): single full-screen view ─────────────────────────
  if (view === 'list') return listPane;
  return renderActiveView();
}

// Right-pane placeholder shown on the open Fold when no job is selected.
function EmptyPane({ onNew }) {
  return (
    <div className="app-fill" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: T.muted, padding: 32 }}>
      <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.7 }}>🔧</div>
      <div style={{ fontWeight: 700, fontSize: 17, color: T.text, marginBottom: 6 }}>Select a work order</div>
      <div style={{ fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>
        Pick a job from the list to open its AI chat, photos, and notes — or start a new one.
      </div>
      <button onClick={onNew} style={{
        marginTop: 20, background: T.blue, color: '#fff', border: 'none', borderRadius: 9,
        padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}>+ New Work Order</button>
    </div>
  );
}
