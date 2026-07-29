import React, { createContext, useContext, useState, useEffect } from 'react';

const CACHE_KEY = 'tenant_branding_cache';

const DEFAULT_BRANDING = {
  companyName:     '',
  logoUrl:         '',
  profileImageUrl: '',
  faviconUrl:      '',
  primaryColor:    '#6b46c1',
  secondaryColor:  '#9f7aea',
  isGradient:      false,
  gradient:        '',
  tagline:         'Fleet Management System',
  supportEmail:    '',
  supportPhone:    '',
  loading:         true,
};

const BrandingContext = createContext(DEFAULT_BRANDING);

export const useBranding = () => useContext(BrandingContext);

const applyToDocument = (b) => {
  if (b.companyName) document.title = b.companyName;
  if (b.faviconUrl) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = b.faviconUrl;
  }
  if (b.primaryColor)   document.documentElement.style.setProperty('--color-primary',   b.primaryColor);
  if (b.secondaryColor) document.documentElement.style.setProperty('--color-secondary', b.secondaryColor);
};

// ─── Helper: read cache ───────────────────────────────────────────────────────
const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
};

// ─── Helper: write cache ──────────────────────────────────────────────────────
const writeCache = (branding) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
  } catch (_) {}
};

// ─── Export so AuthContext / logout can call this ─────────────────────────────
export const clearBrandingCache = () => {
  try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export const BrandingProvider = ({ children }) => {

  // Seed initial state from localStorage cache so first paint = correct logo
  const [branding, setBranding] = useState(() => {
    const cached = readCache();
    if (cached) {
      // Apply cached values to document immediately (title, favicon, CSS vars)
      applyToDocument(cached);
      // Keep loading:true so API refresh runs silently in background
      return { ...cached, loading: true };
    }
    return DEFAULT_BRANDING;
  });

  useEffect(() => {
    const token = localStorage.getItem('token');

    const finish = (data) => {
      if (data?.success && data.branding) {
        const b = data.branding;
        writeCache(b);          // update cache with fresh API data
        applyToDocument(b);
        setBranding({ ...b, loading: false });
      } else {
        setBranding(prev => ({ ...prev, loading: false }));
      }
    };

    if (token) {
      // Logged-in user → fetch their tenant branding
      fetch('/api/tenant/my-branding', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(finish)
        .catch(() => setBranding(prev => ({ ...prev, loading: false })));
    } else {
      // Not logged in → fetch by domain (login screen)
      const browserDomain = window.location.hostname;
      fetch('/api/tenant/branding', {
        headers: { 'x-tenant-domain': browserDomain },
      })
        .then(r => r.json())
        .then(finish)
        .catch(() => setBranding(prev => ({ ...prev, loading: false })));
    }
  }, []);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
};