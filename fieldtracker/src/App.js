import { useState, useEffect } from 'react';
import { loadJobs, persistJobs, loadSettings, saveSettings, loadTemplates, saveTemplates, makeJob } from './utils/helpers';
import { pruneOrphans } from './utils/photoStore';
import { useViewport } from './hooks';
import { T } from './utils/constants';
import ListView from './components/ListView';
import ChatView from './components/ChatView';
import { NewJobView, SettingsView, TemplatesView } from './components/Views';

export default function App() {
  const [jobs, setJobs]           = useState(loadJobs);
  const [settings, setSettings]   = useState(loadSettings);
  const [templates, setTemplates] = useState(loadTemplates);
  const [view, setView]           = useState('list');
  const [activeId, setActiveId]   = useState(null);
  const { wide } = useViewport();

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
    pruneOrphans(next);
    if (activeId === id) setView('list');
  }

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

  function handleSaveSettings(s) {
    setSettings(s); saveSettings(s);
    // stays on settings — user navigates away via the bottom nav
  }

  function saveTemplatesAndContinue(t) {
    setTemplates(t); saveTemplates(t);
  }

  // ─── List pane (always rendered in wide mode, or when view==='list') ────────
  const listPane = (
    <ListView
      jobs={jobs}
      onNew={() => go('new')}
      onOpen={id => go('chat', id)}
      onDelete={deleteJob}
      onDeleteMany={deleteJobs}
      onComplete={completeJob}
      onMutate={mutate}
      activeId={wide ? activeId : null}
      compact={wide}
    />
  );

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
            apiKey={settings.apiKey || ''}
            hideBack={wide}
          />
        );

      case 'settings':
        return <SettingsView onBack={backToList} settings={settings} onSave={handleSaveSettings} />;

      case 'templates':
        return <TemplatesView onBack={backToList} templates={templates} onSave={saveTemplatesAndContinue} />;

      case 'list':
      default:
        return wide ? <EmptyPane onNew={() => go('new')} /> : null;
    }
  }

  // ─── Bottom nav ─────────────────────────────────────────────────────────────
  // Hidden only when the user is inside a job's chat (ChatView has its own nav).
  const showNav = view !== 'chat';

  function BottomNavBar({ fixed = false }) {
    const s = fixed
      ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }
      : {};
    return (
      <div style={{
        ...s,
        background: T.surface,
        borderTop: `1px solid ${T.border}`,
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <NavTab icon="📋" label="Jobs"      active={view === 'list'}      onClick={() => go('list')} />
        <NavTab icon="➕" label="New WO"    active={view === 'new'}       onClick={() => go('new')} accent />
        <NavTab icon="📑" label="Templates" active={view === 'templates'} onClick={() => go('templates')} />
        <NavTab icon="⚙️" label="Settings"  active={view === 'settings'}  onClick={() => go('settings')} />
      </div>
    );
  }

  // ─── Wide (Fold open): two panes side by side ────────────────────────────────
  // Nav is pinned at the bottom of the left pane via flexbox (not position:fixed).
  if (wide) {
    return (
      <div className="app-fill" style={{ display: 'flex', background: T.bg, color: T.text, fontFamily: 'Inter,system-ui,sans-serif', overflow: 'hidden' }}>
        <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${T.border}`, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {listPane}
          </div>
          <BottomNavBar />
        </div>
        <div style={{ flex: 1, height: '100%', overflowY: 'auto', position: 'relative' }}>
          {renderActiveView()}
        </div>
      </div>
    );
  }

  // ─── Narrow (cover screen): single full-screen view + fixed bottom nav ───────
  // Chat gets the full screen; all other views share the persistent nav.
  if (view === 'chat') return renderActiveView();

  return (
    <>
      {view === 'list' ? listPane : renderActiveView()}
      {showNav && <BottomNavBar fixed />}
    </>
  );
}

function NavTab({ icon, label, active, onClick, accent = false }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '10px 4px 8px',
      background: accent ? T.blue : 'transparent', border: 'none',
      cursor: 'pointer', color: accent ? '#fff' : active ? T.blue : T.muted,
      position: 'relative', fontFamily: 'Inter,system-ui,sans-serif',
    }}>
      {active && !accent && (
        <div style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: 2, background: T.blue, borderRadius: 99 }} />
      )}
      <span style={{ fontSize: 20, lineHeight: 1, marginBottom: 3 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: active || accent ? 700 : 500 }}>{label}</span>
    </button>
  );
}

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
