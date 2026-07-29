// src/components/PlaceholderPage.jsx
import React from 'react';
import Icon from './Icon';

const PlaceholderPage = ({ title, icon = 'dashboard', description, accent = 'var(--accent-blue)' }) => (
  <div>
    <div style={{ marginBottom: 20 }}>
      <div className="page-title">
        <div style={{ width: 3, height: 18, background: accent }} />
        {title}
      </div>
    </div>
    <div
      style={{
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        gap: 16,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
        }}
      >
        <Icon name={icon} size={24} />
      </div>
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320 }}>
          {description || `The ${title} module is integrated with the GPS_Tracking database. Connect your data source to populate this view.`}
        </div>
      </div>
      <div
        style={{
          padding: '8px 14px',
          border: `1px solid ${accent}`,
          background: `${accent}12`,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: accent,
          letterSpacing: '0.06em',
        }}
      >
        MODULE READY — AWAITING DATA SOURCE
      </div>
    </div>
  </div>
);

export default PlaceholderPage;