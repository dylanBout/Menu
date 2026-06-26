import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Voice input ──────────────────────────────────────────────────────────────
export function useVoice(onResult) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggle = useCallback(() => {
    if (!supported) { alert('Voice input not supported. Try Chrome on Android.'); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = e => onResult(e.results[0][0].transcript);
    rec.onerror  = () => setListening(false);
    rec.onend    = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  }, [listening, supported, onResult]);

  return { listening, toggle, supported };
}

// ─── Viewport / foldable detection ────────────────────────────────────────────
// Tracks live width so the app reflows instantly when a Z Fold is opened/closed.
// `wide` is true on the open inner screen (roughly square, ~580px+ CSS px),
// false on the narrow cover screen. Debounced with rAF so the fold animation
// doesn't thrash React.
const WIDE_BREAKPOINT = 540; // px — below the Fold 7 inner screen, above the cover screen

export function useViewport() {
  const [vp, setVp] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 400,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    let frame = null;
    const measure = () => {
      frame = null;
      setVp({ width: window.innerWidth, height: window.innerHeight });
    };
    const onResize = () => { if (frame === null) frame = requestAnimationFrame(measure); };
    window.addEventListener('resize', onResize);
    // Some foldables fire orientationchange instead of/again after resize.
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return {
    width: vp.width,
    height: vp.height,
    wide: vp.width >= WIDE_BREAKPOINT,           // open inner screen → 2-pane
    landscape: vp.width > vp.height,
  };
}

// ─── Online status ────────────────────────────────────────────────────────────
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

// ─── Pull to refresh ──────────────────────────────────────────────────────────
export function usePullToRefresh(onRefresh) {
  const [pullY, setPullY]       = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY  = useRef(null);
  const THRESHOLD = 60;

  const onTouchStart = e => { startY.current = e.touches[0].clientY; };
  const onTouchMove  = e => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && window.scrollY === 0) setPullY(Math.min(dy, 80));
  };
  const onTouchEnd = async () => {
    if (pullY >= THRESHOLD) {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
    }
    setPullY(0); startY.current = null;
  };

  return { pullY, refreshing, onTouchStart, onTouchMove, onTouchEnd, THRESHOLD };
}

// ─── Swipe to reveal ─────────────────────────────────────────────────────────
export function useSwipe(threshold = 70) {
  const [offset, setOffset]   = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startX = useRef(null);

  const onTouchStart = e => { startX.current = e.touches[0].clientX; };
  const onTouchMove  = e => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -120));
  };
  const onTouchEnd = () => {
    if (offset < -threshold) { setOffset(-110); setRevealed(true); }
    else { setOffset(0); setRevealed(false); }
    startX.current = null;
  };
  const reset = () => { setOffset(0); setRevealed(false); };

  return { offset, revealed, reset, onTouchStart, onTouchMove, onTouchEnd };
}

// ─── Auto-resize textarea ─────────────────────────────────────────────────────
export function useAutoResize(value) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + 'px';
  }, [value]);
  return ref;
}

// ─── Toast queue ──────────────────────────────────────────────────────────────
export function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, type = 'info') => setToast({ message, type }), []);
  const hide  = useCallback(() => setToast(null), []);
  return { toast, show, hide };
}

// ─── Local state with persistence ────────────────────────────────────────────
export function usePersistedState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : defaultValue; }
    catch { return defaultValue; }
  });
  const set = useCallback(value => {
    setState(value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key]);
  return [state, set];
}
