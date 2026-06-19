import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_TIMEOUT = 10 * 60 * 1000;  // 10 minutos
const WARN_BEFORE  =  1 * 60 * 1000;  // avisar 1 minuto antes

export function useIdleLogout(onLogout, enabled = true) {
  const [countdown, setCountdown]   = useState(null); // segundos restantes, null = no warning
  const idleTimer   = useRef(null);
  const warnTimer   = useRef(null);
  const countRef    = useRef(null);

  const clearAllTimers = useCallback(() => {
    clearTimeout(idleTimer.current);
    clearTimeout(warnTimer.current);
    clearInterval(countRef.current);
    setCountdown(null);
  }, []);

  const startCountdown = useCallback(() => {
    let secs = Math.round(WARN_BEFORE / 1000);
    setCountdown(secs);
    countRef.current = setInterval(() => {
      secs -= 1;
      setCountdown(secs);
      if (secs <= 0) clearInterval(countRef.current);
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    if (!enabled) return;
    clearAllTimers();

    warnTimer.current = setTimeout(() => {
      startCountdown();
      idleTimer.current = setTimeout(() => {
        clearAllTimers();
        onLogout();
      }, WARN_BEFORE);
    }, IDLE_TIMEOUT - WARN_BEFORE);
  }, [enabled, clearAllTimers, startCountdown, onLogout]);

  // Attach activity listeners
  useEffect(() => {
    if (!enabled) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handler = () => reset();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    reset(); // start on mount
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearAllTimers();
    };
  }, [enabled, reset, clearAllTimers]);

  return { countdown, stayActive: reset };
}
