import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import loginBg from '../assets/Login.png';
import logoImg from '../assets/Logo.png';
import Lottie from 'lottie-react';
import sadAnimationData from '../assets/sad-hang1.json';
import { useBranding } from '../context/BrandingContext';

// ─────────────────────────────────────────────────────────────────────────────
//  Error type classifier
// ─────────────────────────────────────────────────────────────────────────────
const classifyError = (err) => {
  const data    = err?.response?.data || {};
  const code    = data.code    || '';
  const message = (data.message || '').toLowerCase();

  const isInactive =
    code === 'ACCOUNT_INACTIVE' ||
    message.includes('inactive')    ||
    message.includes('suspended')   ||
    message.includes('disabled')    ||
    message.includes('deactivated') ||
    message.includes('blocked');

  if (isInactive) return 'inactive';
  return 'generic';
};

const LoginPage = () => {
  const [form, setForm]           = useState({ username: '', password: '' });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [errorType, setErrorType] = useState('generic');
  const [showPass, setShowPass]   = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');

  // Rename branding.loading → brandingLoading so it never clashes with form loading
  const {
    companyName,
    logoUrl,
    tagline,
    loading: brandingLoading,
  } = useBranding();

  const { login }                      = useAuth();
  const { success, error: toastError } = useToast();
  const navigate                       = useNavigate();

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setBackendStatus(d.success ? 'up' : 'down'))
      .catch(() => setBackendStatus('down'));
  }, []);

  // ── Dismiss inactive alert and re-enable the form ──
  const dismissInactiveAlert = () => {
    setError('');
    setErrorType('generic');
    setForm(f => ({ ...f, username: '', password: '' }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setErrorType('generic');

    if (!form.username || !form.password) {
      setError('Please enter your username and password.');
      setErrorType('generic');
      return;
    }

    setLoading(true);
    try {
      const dashboardPath = await login(form.username.trim(), form.password);
      success('Login successful');
      navigate(dashboardPath);
    } catch (err) {
      const type = classifyError(err);
      setErrorType(type);

      if (type === 'inactive') {
        setForm(f => ({ ...f, password: '' }));
        setError('ACCOUNT_INACTIVE');
        toastError('Account is inactive. Please contact your administrator.');
      } else {
        const msg = err?.response?.data?.message || 'Invalid username or password. Please try again.';
        setError(msg);
        toastError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Inactive overlay ──
  const renderInactiveOverlay = () => {
    if (!error || errorType !== 'inactive') return null;

    return (
      <div
        onClick={dismissInactiveAlert}
        title="Click anywhere to go back"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.10)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 0,
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: 350, height: 350,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 50,
          filter: 'drop-shadow(0 4px 12px rgba(5,4,4,0.15))',
        }}>
          <Lottie
            animationData={sadAnimationData}
            loop={true}
            autoplay={true}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        <div style={{ textAlign: 'center', maxWidth: '85%', marginBottom: 10 }}>
          <div style={{
            fontSize: 16, fontWeight: 800, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#f50e06', marginBottom: 1,
            textShadow: '0 0 5px rgb(224,201,201)',
          }}>
            ACCOUNT INACTIVE
          </div>
          <div style={{
            fontSize: 14, color: '#f30808c5', lineHeight: 1.4,
            fontWeight: 500, marginBottom: 4,
            textShadow: '0 0 5px rgb(240,217,217)',
          }}>
            Your account has been deactivated
          </div>
          <div style={{
            fontSize: 12, color: '#fc0707', fontWeight: 500,
            textShadow: '0 0 5px rgb(235,195,195)',
          }}>
            Please contact your Administrator to reactivate your account.
          </div>
          <div style={{
            marginTop: 5, fontSize: 11, color: 'rgba(150,50,50,0.70)',
            letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
          }}>
            tap anywhere to go back
          </div>
        </div>
      </div>
    );
  };

  // ── Logo renderer — skeleton → tenant logo → fallback default logo ──────────
  const renderLogo = () => {
    // While branding API hasn't responded yet, show a pulsing skeleton
    // This prevents ANY logo from flashing — correct or wrong
    if (brandingLoading) {
      return (
        <div style={{
          width: 200,
          height: 60,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.18)',
          animation: 'logoPulse 1.1s ease-in-out infinite',
        }} />
      );
    }

    // Branding loaded — if tenant has a logo, show it
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={companyName || 'Logo'}
          style={{ width: 200, height: 60, objectFit: 'contain' }}
        />
      );
    }

    // No tenant logo → show default app logo
    return (
      <img
        src={logoImg}
        alt="Logo"
        style={{ width: 200, height: 40, objectFit: 'contain' }}
      />
    );
  };

  return (
    <>
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes logoPulse {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.75; }
        }
        .login-input {
          width: 100%;
          height: 48px;
          padding: 0 14px;
          background: rgba(255,255,255,0.58);
          border: 1px solid rgba(255,255,255,0.70);
          border-radius: 2px;
          font-size: 15px;
          color: #1a2d3d;
          outline: none;
          box-sizing: border-box;
          font-family: system-ui, sans-serif;
          transition: all 180ms;
        }
        .login-input:focus {
          background: rgba(255,255,255,0.82);
          border-color: rgba(80,140,210,0.80);
          box-shadow: 0 0 0 3px rgba(80,140,210,0.18);
        }
        .login-input::placeholder {
          color: rgba(40,70,100,0.45);
        }
        .login-input.input-error {
          border-color: rgba(200,50,50,0.55);
          background: rgba(255,240,240,0.65);
        }
        .login-btn {
          width: 100%;
          height: 48px;
          background: linear-gradient(135deg, rgba(45,148,155,0.82), rgba(24,131,117,0.92));
          border: 1px solid rgba(7,150,150,0.3);
          border-radius: 2px;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 14px rgba(25,65,115,0.30);
          transition: background 180ms;
          font-family: system-ui, sans-serif;
        }
        .login-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(54,173,163,0.9), rgba(44,145,128,0.98));
        }
        .login-btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
      `}</style>

      <div style={{
        width: '100vw', height: '100vh',
        background: '#1a2a3a',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        {/* Background image */}
        <img
          src={loginBg}
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center center',
            userSelect: 'none', pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Login card */}
        <div style={{
          position: 'absolute',
          top: '52%', left: '25%',
          transform: 'translate(-50%, -50%)',
          width: 450,
          zIndex: 10,
        }}>
          <form onSubmit={handleSubmit} autoComplete="off" style={{ position: 'relative' }}>
            <div style={{
              background: 'rgba(255,255,255,0.22)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.50)',
              borderRadius: 0,
              padding: '60px 30px 50px',
              boxShadow:
                '0 8px 32px rgba(0,0,0,0.15), ' +
                '0 2px 8px rgba(0,0,0,0.08), ' +
                'inset 0 1px 0 rgba(255,255,255,0.55)',
              position: 'relative',
              minHeight: 500,
            }}>

              {/* Inactive overlay */}
              {renderInactiveOverlay()}

              {/* Form content */}
              <div style={{
                opacity: 1,
                pointerEvents: errorType === 'inactive' ? 'none' : 'auto',
                transition: 'opacity 0.3s ease',
              }}>

                {/* ── LOGO — skeleton → tenant logo → default logo ── */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 1,
                  minHeight: 60,          // reserve space so layout never jumps
                }}>
                  {renderLogo()}
                </div>

                {/* Company name */}
                <div style={{
                  display: 'flex', textAlign: 'center',
                  justifyContent: 'center', marginBottom: 16,
                }}>
                  <span style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: companyName && companyName.length > 20 ? 17 : 24,
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                    width: '100%',
                    textAlign: 'center',
                    background: 'linear-gradient(135deg, #4b3f43 0%, #453f57 32%, #46515a 65%, #5e4953 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    lineHeight: 1.3,
                    userSelect: 'none',
                  }}>
                    {companyName || 'FLEET MANAGEMENT'}
                  </span>
                </div>

                {/* Tagline */}
                <div style={{
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(219,222,230,0.75)',
                  marginBottom: 32,
                }}>
                  {tagline || 'Fleet Management'}
                </div>

                {/* Generic error */}
                {error && errorType !== 'inactive' && (
                  <div style={{
                    background: 'rgba(220,50,50,0.10)',
                    border: '1px solid rgba(220,50,50,0.35)',
                    borderRadius: 4,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#8b1a1a',
                    marginBottom: 20,
                    textAlign: 'center',
                    lineHeight: 1.4,
                  }}>
                    {error}
                  </div>
                )}

                {/* Username */}
                <div style={{ marginBottom: 20 }}>
                  <input
                    className={`login-input${errorType === 'inactive' ? ' input-error' : ''}`}
                    type="text"
                    placeholder="Username"
                    value={form.username}
                    onChange={e => {
                      setForm({ ...form, username: e.target.value });
                      setError(''); setErrorType('generic');
                    }}
                    autoFocus
                    autoComplete="off"
                    disabled={errorType === 'inactive'}
                  />
                </div>

                {/* Password */}
                <div style={{ marginBottom: 28, position: 'relative' }}>
                  <input
                    className={`login-input${errorType === 'inactive' ? ' input-error' : ''}`}
                    type={showPass ? 'text' : 'password'}
                    placeholder="Password"
                    value={form.password}
                    onChange={e => {
                      setForm({ ...form, password: e.target.value });
                      setError(''); setErrorType('generic');
                    }}
                    autoComplete="new-password"
                    style={{ paddingRight: 40 }}
                    disabled={errorType === 'inactive'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    style={{
                      position: 'absolute',
                      right: 12, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none',
                      cursor: errorType === 'inactive' ? 'not-allowed' : 'pointer',
                      padding: 4,
                      color: 'rgba(40,70,100,0.45)',
                      display: 'flex', alignItems: 'center',
                    }}
                    disabled={errorType === 'inactive'}
                  >
                    {showPass ? (
                      <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                        <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3"/>
                        <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
                        <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                        <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3"/>
                        <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
                      </svg>
                    )}
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="login-btn"
                  disabled={loading || errorType === 'inactive'}
                  style={{ marginBottom: 20 }}
                >
                  {loading ? (
                    <>
                      <div style={{
                        width: 14, height: 14,
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'loginSpin 0.7s linear infinite',
                      }} />
                      Signing in…
                    </>
                  ) : 'Secure Login'}
                </button>

                {/* Server status */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'flex-start', gap: 8, marginTop: 12,
                }}>
                  <div style={{
                    width: 10, height: 10,
                    borderRadius: '50%',
                    background:
                      backendStatus === 'up'   ? '#27ae60' :
                      backendStatus === 'down' ? '#e74c3c' : '#aaa',
                    boxShadow: backendStatus === 'up'
                      ? '0 0 6px rgba(4,131,57,0.6)' : 'none',
                  }} />
                  <span style={{
                    fontSize: 12,
                    color: 'rgba(253,239,216,0.99)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontFamily: 'monospace',
                    lineHeight: 1,
                  }}>
                    {backendStatus === 'up'   ? 'Server online'  :
                     backendStatus === 'down' ? 'Server offline' :
                                                'Connecting…'}
                  </span>
                </div>

              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default LoginPage;