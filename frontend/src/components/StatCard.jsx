import React from 'react';
import Icon from './Icon';

const StatCard = ({ label, value, sub, accent = 'blue', icon }) => (
  <div className={`stat-card ${accent}`}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value ?? '—'}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      {icon && (
        <div
          style={{
            width: 36,
            height: 36,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <Icon name={icon} size={16} />
        </div>
      )}
    </div>
  </div>
);

export default StatCard;
