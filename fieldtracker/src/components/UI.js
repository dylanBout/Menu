import { T, STATUS_CFG } from '../utils/constants';
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '../hooks';
import { getPhotoURL } from '../utils/photoStore';

// Loads a photo from IndexedDB by id and renders it. Falls back to an inline
// preview data-URL if provided (used while a photo is still staged in memory).
export function Photo({ id, preview, onClick, style }) {
  const [url, setUrl] = useState(preview || null);
  useEffect(() => {
    let alive = true;
    if (!preview && id) getPhotoURL(id).then(u => { if (alive && u) setUrl(u); });
    return () => { alive = false; };
  }, [id, preview]);
  if (!url) {
    return <div style={{ ...style, background: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 11 }}>📷</div>;
  }
  return <img src={url} alt="" onClick={onClick} style={style} />;
}

export const Btn = ({ children, onClick, color = T.blue, ghost = false, danger = false, disabled = false, full = false, small = false, style = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: danger ? T.red : ghost ? 'transparent' : color,
    color: ghost ? T.muted : '#fff',
    border: ghost ? `1px solid ${T.border}` : danger ? 'none' : 'none',
    borderRadius: 8,
    padding: small ? '6px 11px' : '9px 14px',
    fontSize: small ? 12 : 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: full ? '100%' : undefined,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
    ...style,
  }}>{children}</button>
);

export const Label = ({ children, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.7px' }}>{children}</div>
    {right && <div style={{ fontSize: 11, color: T.muted }}>{right}</div>}
  </div>
);

export const Header = ({ left, center, right }) => (
  <div style={{
    background: T.surface, borderBottom: `1px solid ${T.border}`,
    padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 50,
  }}>
    <div style={{ minWidth: 70 }}>{left}</div>
    <div style={{ fontWeight: 700, fontSize: 15, textAlign: 'center', flex: 1 }}>{center}</div>
    <div style={{ minWidth: 70, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
  </div>
);

export const TextInput = ({ label, value, onChange, placeholder, mono = false, hint, style = {}, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <Label>{label}</Label>}
    <input value={value} onChange={onChange} placeholder={placeholder}
      style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
        padding: '10px 13px', fontSize: 14, color: T.text, outline: 'none',
        width: '100%', boxSizing: 'border-box', fontFamily: mono ? 'monospace' : 'inherit',
        ...style,
      }} {...props} />
    {hint && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{hint}</div>}
  </div>
);

export const Textarea = ({ label, value, onChange, placeholder, minHeight = 120, right, style = {} }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <Label right={right}>{label}</Label>}
    <textarea value={value} onChange={onChange} placeholder={placeholder}
      style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
        padding: '10px 13px', fontSize: 14, color: T.text, outline: 'none',
        width: '100%', boxSizing: 'border-box', resize: 'vertical',
        minHeight, lineHeight: 1.65, fontFamily: 'inherit', ...style,
      }} />
  </div>
);

export const Chip = ({ label, color, onRemove, small = false }) => (
  <span style={{
    background: color + '22', color, border: `1px solid ${color}44`,
    fontSize: small ? 10 : 11, fontWeight: 700,
    padding: small ? '2px 7px' : '3px 9px', borderRadius: 99,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }}>
    {label}
    {onRemove && <span onClick={onRemove} style={{ cursor: 'pointer', opacity: 0.7, fontSize: 13, lineHeight: 1 }}>×</span>}
  </span>
);

export const Divider = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
    <div style={{ flex: 1, height: 1, background: T.border }} />
    {label && <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>}
    <div style={{ flex: 1, height: 1, background: T.border }} />
  </div>
);

export function Toast({ message, onDone, type = 'info' }) {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, [onDone]);
  const colors = { info: T.blue, success: T.green, error: T.red };
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      background: T.surface, border: `1px solid ${colors[type] || T.border}`,
      color: T.text, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
      zIndex: 300, whiteSpace: 'nowrap', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      maxWidth: '90vw', textAlign: 'center',
    }}>{message}</div>
  );
}

export function Lightbox({ src, photoId, onClose }) {
  const [url, setUrl] = useState(src || null);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  useEffect(() => {
    let alive = true;
    if (!src && photoId) getPhotoURL(photoId).then(u => { if (alive && u) setUrl(u); });
    return () => { alive = false; };
  }, [src, photoId]);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {url && <img src={url} alt="" style={{ maxWidth: '96vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 10 }}
        onClick={e => e.stopPropagation()} />}
      <button onClick={onClose} style={{
        position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.7)',
        color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36,
        fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  );
}

export function LoadingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {[0, 0.2, 0.4].map((d, i) => (
        <span key={i} style={{ animation: `dp 1.2s ${d}s infinite`, opacity: 0.3, fontSize: 16, color: T.muted }}>●</span>
      ))}
      <style>{`@keyframes dp{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </span>
  );
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div style={{ background: T.yellow + '22', border: `1px solid ${T.yellow}44`, color: T.yellow, padding: '8px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
      ⚠️ You're offline — AI features unavailable until reconnected
    </div>
  );
}

export const Section = ({ children, style = {} }) => (
  <div style={{ padding: '0 14px 14px', ...style }}>{children}</div>
);

export const Card = ({ children, onClick, style = {} }) => (
  <div onClick={onClick} style={{
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
    padding: '14px 16px', cursor: onClick ? 'pointer' : 'default', ...style,
  }}>{children}</div>
);

export const Row = ({ children, style = {} }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...style }}>{children}</div>
);

export const StatusPill = ({ status }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.open;
  return (
    <span style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44`, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99 }}>
      {cfg.label}
    </span>
  );
};
