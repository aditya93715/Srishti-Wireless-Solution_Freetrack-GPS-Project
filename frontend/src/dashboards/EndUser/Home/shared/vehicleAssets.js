// ─────────────────────────────────────────────────────────────────────────────
// vehicleAssets.js
// All static asset maps, state colours, CSS filters and overlay colours
// shared between Dashboard.jsx and AdvanceDashboard.jsx
// Place at: frontend/src/dashboards/Admin/Home/shared/vehicleAssets.js
// ─────────────────────────────────────────────────────────────────────────────

// ── Stat-card images ──────────────────────────────────────────────────────────
export const STAT_IMAGES = {
  all:         new URL('../../../../assets/total.png',       import.meta.url).href,
  running:     new URL('../../../../assets/Running.png',     import.meta.url).href,
  stopped:     new URL('../../../../assets/stop.png',        import.meta.url).href,
  idle:        new URL('../../../../assets/IDLE.png',        import.meta.url).href,
  unreachable: new URL('../../../../assets/unreachable.png', import.meta.url).href,
  overspeed:   new URL('../../../../assets/Overspeed.png',   import.meta.url).href,
  new:         new URL('../../../../assets/new.png',         import.meta.url).href,
  inactive:    new URL('../../../../assets/Inactive.png',    import.meta.url).href,
};

// ── Side-view vehicle images (used in table rows & card list) ─────────────────
export const VEHICLE_IMAGES = {
  car:     new URL('../../../../assets/car.png',     import.meta.url).href,
  truck:   new URL('../../../../assets/truck.png',   import.meta.url).href,
  bus:     new URL('../../../../assets/bus.png',     import.meta.url).href,
  bike:    new URL('../../../../assets/bike.png',    import.meta.url).href,
  tractor: new URL('../../../../assets/tractor.png', import.meta.url).href,
  auto:    new URL('../../../../assets/auto.png',    import.meta.url).href,
  van:     new URL('../../../../assets/van.png',     import.meta.url).href,
  pickup:  new URL('../../../../assets/pickup.png',  import.meta.url).href,
  tanker:  new URL('../../../../assets/tanker.png',  import.meta.url).href,
  jcb:     new URL('../../../../assets/jcb.png',     import.meta.url).href,
};

// ── Top-view vehicle images (used on map markers) ─────────────────────────────
export const VEHICLE_IMAGES_TOPVIEW = {
  car:     new URL('../../../../assets/car_top.png',     import.meta.url).href,
  truck:   new URL('../../../../assets/truck_top.png',   import.meta.url).href,
  bus:     new URL('../../../../assets/bus_top.png',     import.meta.url).href,
  bike:    new URL('../../../../assets/bike_top.png',    import.meta.url).href,
  tractor: new URL('../../../../assets/tractor_top.png', import.meta.url).href,
  auto:    new URL('../../../../assets/auto_top.png',    import.meta.url).href,
  van:     new URL('../../../../assets/van_top.png',     import.meta.url).href,
  pickup:  new URL('../../../../assets/pickup_top.png',  import.meta.url).href,
  tanker:  new URL('../../../../assets/tanker_top.png',  import.meta.url).href,
  jcb:     new URL('../../../../assets/jcb_top.png',     import.meta.url).href,
};

// ── State → accent colour ─────────────────────────────────────────────────────
export const STATE_COLOR = {
  running:     '#16a34a',
  stopped:     '#dc2626',
  overspeed:   '#ea580c',
  idle:        '#ca8a04',
  unreachable: '#7c3aed',
  new:         '#0891b2',
  inactive:    '#64748b',
};

// ── State → light background tint (used inside VehicleCard cells) ─────────────
export const STATE_BG = {
  running:     'rgba(22,163,74,0.07)',
  stopped:     'rgba(220,38,38,0.07)',
  overspeed:   'rgba(234,88,12,0.07)',
  idle:        'rgba(202,138,4,0.07)',
  unreachable: 'rgba(124,58,237,0.07)',
  new:         'rgba(8,145,178,0.07)',
  inactive:    'rgba(100,116,139,0.05)',
};

// ── State → CSS filter (used to tint <img> icons on the map popup) ────────────
export const STATE_FILTER = {
  running:     'brightness(0) saturate(100%) invert(44%) sepia(60%) saturate(650%) hue-rotate(100deg) brightness(0.88)',
  stopped:     'brightness(0) saturate(100%) invert(22%) sepia(98%) saturate(2400%) hue-rotate(352deg) brightness(0.92)',
  overspeed:   'brightness(0) saturate(100%) invert(48%) sepia(95%) saturate(1600%) hue-rotate(9deg) brightness(0.98)',
  idle:        'brightness(0) saturate(100%) invert(58%) sepia(88%) saturate(1100%) hue-rotate(24deg) brightness(0.82)',
  unreachable: 'brightness(0) saturate(100%) invert(24%) sepia(92%) saturate(3800%) hue-rotate(260deg) brightness(0.82)',
  new:         'brightness(0) saturate(100%) invert(37%) sepia(82%) saturate(800%) hue-rotate(176deg) brightness(0.93)',
  inactive:    'brightness(0) saturate(100%) invert(46%) sepia(10%) saturate(520%) hue-rotate(175deg) brightness(0.86)',
};

// ── State → semi-transparent overlay colour (VehicleTypeIcon blend layer) ─────
export const STATE_OVERLAY = {
  running:     'rgba(22, 163, 74, 0.32)',
  stopped:     'rgba(220, 38, 38, 0.32)',
  overspeed:   'rgba(234, 88, 12, 0.35)',
  idle:        'rgba(202, 138, 4, 0.32)',
  unreachable: 'rgba(124, 58, 237, 0.32)',
  new:         'rgba(8, 145, 178, 0.32)',
  inactive:    'rgba(100, 116, 139, 0.28)',
};

// ── Convenience getters ───────────────────────────────────────────────────────
export const getStateColor   = state => STATE_COLOR[state]   || STATE_COLOR.inactive;
export const getStateBg      = state => STATE_BG[state]      || STATE_BG.inactive;
export const getStateFilter  = state => STATE_FILTER[state]  || STATE_FILTER.inactive;
export const getStateOverlay = state => STATE_OVERLAY[state] || STATE_OVERLAY.inactive;

export const getVehicleImage        = type => VEHICLE_IMAGES[String(type || '').toLowerCase()]        || VEHICLE_IMAGES.car;
export const getVehicleImageTopView = type => VEHICLE_IMAGES_TOPVIEW[String(type || '').toLowerCase()] || VEHICLE_IMAGES_TOPVIEW.car;

// ── Map tile definitions ──────────────────────────────────────────────────────
export const MAP_TILES = {
  street: {
    url:         'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    label:       'Street',
    maxZoom:     19,
    subdomains:  null,
  },
  dark: {
    url:         'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
    label:       'Dark',
    maxZoom:     19,
    subdomains:  'abcd',
  },
  sat: {
    url:         'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    label:       'Satellite',
    maxZoom:     18,
    subdomains:  null,
  },
};

// ── Shared stat-card config (used by DashboardTopbar) ─────────────────────────
export const STAT_CARD_CONFIG = [
  { key: 'all',         label: 'TOTAL',       color: '#4f46e5', imgKey: 'all'         },
  { key: 'running',     label: 'RUNNING',     color: '#16a34a', imgKey: 'running'     },
  { key: 'stopped',     label: 'STOPPED',     color: '#dc2626', imgKey: 'stopped'     },
  { key: 'idle',        label: 'IDLE',        color: '#ca8a04', imgKey: 'idle'        },
  { key: 'unreachable', label: 'UNREACHABLE', color: '#7c3aed', imgKey: 'unreachable' },
  { key: 'overspeed',   label: 'OVERSPEED',   color: '#ea580c', imgKey: 'overspeed'   },
  { key: 'new',         label: 'NEW',         color: '#0891b2', imgKey: 'new'         },
  { key: 'inactive',    label: 'INACTIVE',    color: '#64748b', imgKey: 'inactive'    },
];