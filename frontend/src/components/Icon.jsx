// icon.jsx
import React from 'react';

const icons = {
  // Existing icons (keeping all your current ones)
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 13c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  vehicle: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 9l2-5h10l2 5v3H1V9z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="4" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  device: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2" width="10" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="11" r="1" fill="currentColor"/>
    </svg>
  ),
  tracking: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/>
      <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  playback: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 5.5l5 2.5-5 2.5V5.5z" fill="currentColor"/>
    </svg>
  ),
  geofence: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2C5.5 2 3 4 3 7c0 4 5 8 5 8s5-4 5-8c0-3-2.5-5-5-5z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="7" r="1.5" fill="currentColor"/>
    </svg>
  ),
  alert: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L1 14h14L8 1z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="12" r="0.75" fill="currentColor"/>
    </svg>
  ),
  reports: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  billing: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="9" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 14c0-3 2.686-4.5 6-4.5s6 1.5 6 4.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  maintenance: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10.5 1.5a3 3 0 11-3 3h-5l-1 1 1 1h5a3 3 0 003 3 3 3 0 000-6v-2z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  fuel: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="9" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 6h2l1 2v4h-3" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="7" x2="8" y2="7" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  drivers: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 7l1.5 1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  plans: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="3" x2="5" y2="13" stroke="currentColor" strokeWidth="1"/>
      <line x1="10" y1="3" x2="10" y2="13" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 2H2v12h4M11 5l3 3-3 3M6 8h8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2l3 3-8 8H1v-3L9 2z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 3V2h4v1M3 3l1 9h6l1-9" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="9" y1="9" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  chevronLeft: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  menu: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  bell: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2a5 5 0 00-5 5v3l-1 1h12l-1-1V7a5 5 0 00-5-5zM6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  eye: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
    </svg>
  ),

  // NEW ICONS - Missing from your config
  home: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 7L8 2L14 7V14H10V10H6V14H2V7Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    </svg>
  ),
  
  analytics: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="8" width="3" height="6" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="7" y="5" width="3" height="9" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="12" y="2" width="3" height="12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  chart: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 14H15" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 10L6 5L9 8L13 3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="13" cy="3" r="1" fill="currentColor"/>
      <circle cx="9" cy="8" r="1" fill="currentColor"/>
      <circle cx="6" cy="5" r="1" fill="currentColor"/>
      <circle cx="3" cy="10" r="1" fill="currentColor"/>
    </svg>
  ),
  
  truck: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="7" width="10" height="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 7L13 9V11H11V7Z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="4" cy="11" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="11" r="2" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  tool: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10.5 5.5L13 3L14 4L11.5 6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6.5 9.5L4 12L3 11L5.5 8.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  document: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2H10L13 5V14H3V2Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  user: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 13c0-2 2.686-3 6-3s6 1 6 3" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  group: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="11" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 13c0-1.5 1.5-2.5 3-2.5s3 1 3 2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 13c0-1.5 1.5-2.5 3-2.5s3 1 3 2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  groups: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="9" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 13c0-1.5 1-2.5 2-2.5s2 1 2 2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 13c0-1.5 1-2.5 2-2.5s2 1 2 2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 13c0-1.5 1-2.5 2-2.5s2 1 2 2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  car: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 8L4 4H12L14 8V12H2V8Z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="11" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  driver: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 14c0-2 2.686-3 6-3s6 1 6 3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 7L12.5 8.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  payment: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  
  enquiry: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4 12L6 10H10L12 12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  inventory: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  coin: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  distance: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="13" x2="14" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
      <circle cx="2" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="14" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  assignment: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  expense: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4 8H12" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  
  map: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3L6 2V13L2 14V3Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 2L14 5V14L6 13V2Z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  idle: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="5" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="0.75" fill="currentColor"/>
    </svg>
  ),
  
  poi: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2C5.5 2 3 4 3 7c0 4 5 8 5 8s5-4 5-8c0-3-2.5-5-5-5z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="7" r="1" fill="currentColor"/>
      <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1"/>
    </svg>
  ),
  
  mobile: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="2" width="8" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  ride: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 6L8 4L11 6" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  command: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 5L8 8L5 11" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 5L8 8L11 11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  sensor: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 2V4M8 12V14M2 8H4M12 8H14" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  sim: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 2L10 2L13 5V14H4V2Z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  speed: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 8L11 5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  
  status: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
    </svg>
  ),
  
  stop: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="4" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  subscription: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4" width="12" height="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 2V6M11 2V6" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  expired: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  travel: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12L5 4H11L14 12" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="11" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  "vehicle-log": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  "alert-add": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L1 14h14L8 1z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6.5" y1="8.5" x2="9.5" y2="8.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  notification: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2a5 5 0 00-5 5v3l-1 1h12l-1-1V7a5 5 0 00-5-5zM6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  parking: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2" width="10" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 6H9C10 6 11 7 11 8C11 9 10 10 9 10H6V6Z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  announcement: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 5L10 2V14L2 11V5Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 8H14V10H10" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  theme: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="2" fill="currentColor"/>
    </svg>
  ),
  
  "vehicle-config": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  certificate: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2" width="10" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="6" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 8L9 10H7L8 8Z" fill="currentColor"/>
    </svg>
  ),
  
  "custom-fields": (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  support: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 5L8 8L11 5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 11L8 8L11 11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),


  admin: (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 14C2 11.5 4 9 8 9C12 9 14 11.5 14 14" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M12 4L13 5L12 6" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M4 4L3 5L4 6" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="7" y="9" width="2" height="4" fill="currentColor"/>
  </svg>
),

dealer: (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="5" width="12" height="9" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <circle cx="5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <circle cx="11" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M4 5L6 2H10L12 5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M8 5V2" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="8" cy="8" r="1" fill="currentColor"/>
  </svg>
),

"user-management": (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M2 13C2 10.5 3.5 9 5 9C6.5 9 8 10.5 8 13" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M8 13C8 10.5 9.5 9 11 9C12.5 9 14 10.5 14 13" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1"/>
  </svg>
),
  
  ticket: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 5L5 2L15 8L11 11L1 5Z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="3" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  answer: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3H14V11H5L2 13V3Z" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="9" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  
  access: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="6" width="10" height="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 6V4C5 2.5 6 1 8 1C10 1 11 2.5 11 4V6" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
};

const Icon = ({ name, size = 16, color, style }) => {
  const icon = icons[name];
  if (!icon) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: color || 'currentColor',
        flexShrink: 0,
        ...style,
      }}
    >
      {React.cloneElement(icon, { width: size, height: size })}
    </span>
  );
};

export default Icon;