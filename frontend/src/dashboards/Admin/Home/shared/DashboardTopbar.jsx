import { useRef, useState } from 'react';
import { STAT_IMAGES, STAT_CARD_CONFIG } from './vehicleAssets.js';
import { Toggle }                         from './vehicleWidgets.jsx';

// ── Columns dropdown ──────────────────────────────────────────────────────────
const ColumnsDropdown = ({ colSettings, onToggle, onClose }) => {
  const enabled = colSettings.filter(c => c.on).length;
  return (
    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 3000, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, boxShadow: '0 8px 28px rgba(0,0,0,0.13)', width: 240, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>Show / Hide Columns</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{enabled} of {colSettings.length} visible</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
      </div>
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {colSettings.map(col => (
          <div key={col.key}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid #f8fafc', background: '#fff' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            <span style={{ fontSize: 12, color: col.on ? '#1e293b' : '#94a3b8', fontWeight: col.on ? 500 : 400 }}>{col.label}</span>
            <Toggle checked={col.on} onChange={() => onToggle(col.key)} />
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 14px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => colSettings.forEach(c => !c.on && onToggle(c.key))} style={{ fontSize: 11, color: 'var(--theme-color)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Show All</button>
        <button onClick={onClose} style={{ fontSize: 11, background: 'var(--theme-color)', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 14px', cursor: 'pointer', fontWeight: 600 }}>Done</button>
      </div>
    </div>
  );
};

// ── DashboardTopbar ───────────────────────────────────────────────────────────
/**
 * Props
 * ─────
 * search           string               current search value
 * onSearchChange   fn(value)            called on every keystroke
 *
 * stats            object               { all, running, stopped, idle, unreachable, overspeed, new, inactive }
 * activeFilter     string               currently active stat key, e.g. 'running'
 * onFilterChange   fn(key)              called when a stat card is clicked
 *
 * activeColor      string               theme accent colour (#hex)
 *
 * // Columns toggle (Dashboard only — omit or pass showColumns={false} for AdvanceDashboard)
 * showColumns      bool                 default false
 * colSettings      array                [{ key, label, on }]
 * onColToggle      fn(key)
 *
 * // Filter modal button (Dashboard only — omit or pass showFilter={false} for AdvanceDashboard)
 * showFilter       bool                 default false
 * hasActiveFilter  bool
 * onFilterClick    fn()
 * onClearFilter    fn()
 *
 * // Sidebar toggle (AdvanceDashboard only)
 * showSidebarToggle bool                default false
 * sidebarOpen       bool
 * onSidebarToggle   fn()
 */
export default function DashboardTopbar({
  // Search
  search        = '',
  onSearchChange,

  // Stats
  stats         = {},
  activeFilter  = 'all',
  onFilterChange,

  // Theme
  activeColor   = '#4f46e5',

  // Columns (Dashboard)
  showColumns   = false,
  colSettings   = [],
  onColToggle,

  // Filter modal (Dashboard)
  showFilter      = false,
  hasActiveFilter = false,
  onFilterClick,
  onClearFilter,

  // Sidebar toggle (AdvanceDashboard)
  showSidebarToggle = false,
  sidebarOpen       = true,
  onSidebarToggle,
}) {
  const colDropdownRef    = useRef(null);
  const [showColDrop, setShowColDrop] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap', gap: '6px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      {/* ── Left side ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

        {/* Sidebar toggle (AdvanceDashboard) */}
        {showSidebarToggle && (
          <button onClick={onSidebarToggle} title={sidebarOpen ? 'Collapse panel' : 'Expand panel'}
            style={{ width: 34, height: 34, borderRadius: 6, border: `1.5px solid ${sidebarOpen ? activeColor + '50' : '#e2e8f0'}`, background: sidebarOpen ? activeColor + '12' : '#f9fafb', color: sidebarOpen ? activeColor : '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {sidebarOpen ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
            </svg>
          </button>
        )}

        {/* Search box */}
        <div style={{ display: 'flex', border: `1.5px solid ${activeColor}40`, borderRadius: 4, overflow: 'hidden', background: '#f8fafc', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search vehicle / driver / IMEI…"
            style={{ border: 'none', outline: 'none', padding: '6px 10px', fontSize: 12, width: 210, background: 'transparent', color: '#1e293b' }}
          />
          {search && (
            <button onClick={() => onSearchChange('')} style={{ background: 'transparent', border: 'none', borderLeft: '1px solid #e2e8f0', padding: '0 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 14, height: '100%' }}>✕</button>
          )}
        </div>

        {/* Filter button (Dashboard) */}
        {showFilter && (
          <button onClick={onFilterClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, border: `1.5px solid ${hasActiveFilter ? activeColor : activeColor + '40'}`, background: hasActiveFilter ? activeColor : '#fff', color: hasActiveFilter ? '#fff' : '#374151', cursor: 'pointer', fontSize: 11, fontWeight: 600, boxShadow: hasActiveFilter ? `0 2px 8px ${activeColor}30` : 'none', position: 'relative' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filter
            {hasActiveFilter && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, right: 3 }} />}
          </button>
        )}

        {/* Columns button (Dashboard) */}
        {showColumns && (
          <div ref={colDropdownRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowColDrop(o => !o)} style={{ border: `1.5px solid ${showColDrop ? activeColor : activeColor + '40'}`, background: showColDrop ? activeColor + '10' : '#fff', color: showColDrop ? activeColor : '#374151', padding: '5px 12px', borderRadius: 4, fontWeight: 600, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              Columns
            </button>
            {showColDrop && (
              <ColumnsDropdown
                colSettings={colSettings}
                onToggle={onColToggle}
                onClose={() => setShowColDrop(false)}
              />
            )}
          </div>
        )}

        {/* Active filter badge */}
        {hasActiveFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: activeColor + '12', border: `1px solid ${activeColor}25`, borderRadius: 3, fontSize: 10, color: activeColor, fontWeight: 600 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filtered
            <button onClick={onClearFilter} style={{ background: 'none', border: 'none', cursor: 'pointer', color: activeColor, fontSize: 11, padding: '0 0 0 2px', lineHeight: 1 }}>✕</button>
          </div>
        )}
      </div>

      {/* ── Right side — stat cards ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        {STAT_CARD_CONFIG.map(s => {
          const count    = stats[s.key] ?? 0;
          const isActive = activeFilter === s.key;
          return (
            <button
              key={s.key}
              className="stat-btn"
              onClick={() => onFilterChange(s.key)}
              style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, background: isActive ? s.color + '18' : '#f8fafc', border: `1px solid ${isActive ? s.color + '50' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', gap: 6, position: 'relative', outline: 'none', minWidth: 0, boxShadow: isActive ? `0 2px 8px ${s.color}25` : '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.15s' }}
            >
              <img
                src={STAT_IMAGES[s.imgKey]}
                alt={s.label}
                style={{ height: 28, width: 'auto', display: 'block', objectFit: 'contain', flexShrink: 0, opacity: isActive ? 1 : 0.7 }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: isActive ? s.color : '#1e293b', lineHeight: 1.1, fontFamily: 'monospace' }}>{count.toLocaleString()}</div>
                <div style={{ fontSize: 7.5, color: isActive ? s.color : '#94a3b8', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
              {/* Live pulse dot on Running card */}
              {s.key === 'running' && count > 0 && (
                <div style={{ position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: '50%', background: s.color, animation: 'pulse 1.5s infinite' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}