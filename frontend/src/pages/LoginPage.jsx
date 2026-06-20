import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// Animated background lines (SVG-based, pure CSS)
function FuturisticBG() {
  return (
    <div className="login-bg" aria-hidden>
      {/* Grid overlay */}
      <div className="login-grid" />
      {/* Diagonal accent lines */}
      <div className="login-line login-line-1" />
      <div className="login-line login-line-2" />
      <div className="login-line login-line-3" />
      {/* Corner brackets */}
      <div className="login-corner login-corner-tl" />
      <div className="login-corner login-corner-br" />
      {/* Glowing orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
    </div>
  );
}

// Animated scanning line on the card
function ScanLine() {
  return <div className="login-scan" aria-hidden />;
}

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [tick, setTick]         = useState(0);

  // Blinking cursor effect for the sub-text
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <FuturisticBG />

      <div className="login-card">
        <ScanLine />

        {/* Logo */}
        <div className="login-logo-wrap">
          <div className="login-logo-badge">
            <span className="llb-a">A</span>
          </div>
          <div>
            <div className="login-logo-text">
              <span className="llo-accent">ACON</span>
              <span className="llo-white"> Internacional</span>
            </div>
            <div className="login-logo-sub">
              WORLDWIDE LOGISTICS CRM<span className="login-cursor">{tick % 2 === 0 ? '|' : ' '}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="login-divider">
          <span className="login-divider-line" />
          <span className="login-divider-text">ACCESO SEGURO</span>
          <span className="login-divider-line" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} autoComplete="on">
          <div className="login-field">
            <label className="login-label">
              <span className="login-label-dot" />
              USUARIO
            </label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <input
                className="login-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@aconinternacional.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label">
              <span className="login-label-dot" />
              CONTRASEÑA
            </label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input
                className="login-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="login-error">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="login-spinner" />
                AUTENTICANDO...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                INICIAR SESIÓN
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <span className="login-footer-dot" />
          Sistema protegido · ACON Internacional © {new Date().getFullYear()}
          <span className="login-footer-dot" />
        </div>
      </div>

      {/* Corner tag */}
      <div className="login-version">v2.0</div>
    </div>
  );
}
