// src/components/Sidebar.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBranding } from '../context/BrandingContext';
import Icon from './Icon';
import defaultLogo from '../assets/Logo.png'; // ← apna logo path yahan set karo

const SIDEBAR_CONFIG = {
  super_admin: {
    label: 'SuperAdmin',
    items: [
      { type: 'dropdown', label: 'Home', icon: 'home',
        items: [
          { label: 'Dashboard',           icon: 'dashboard', path: '/superadmin/dashboard' },
          { label: 'Advance Dashboard',   icon: 'analytics', path: '/superadmin/advance-dashboard' },
          { label: 'Analytics Dashboard', icon: 'chart',     path: '/superadmin/analytics-dashboard' },
        ]
      },
      { type: 'dropdown', label: 'Custom Management', icon: 'users',
        items: [
          { label: 'Admin Management',  icon: 'admin',  path: '/superadmin/admins' },
          { label: 'Dealer Management', icon: 'dealer', path: '/superadmin/dealers' },
          { label: 'User Management',   icon: 'user',   path: '/superadmin/users' },
        ]
      },
      { type: 'dropdown', label: 'Manage', icon: 'settings',
        items: [
          { label: 'Vehicles',         icon: 'vehicle',   path: '/superadmin/vehicles' },
          { label: 'Devices',          icon: 'device',    path: '/superadmin/devices' },
          { label: 'Vehicle Detail',   icon: 'car',       path: '/superadmin/vehicle-detail' },
          { label: 'Driver Detail',    icon: 'driver',    path: '/superadmin/driver-detail' },
          { label: 'Geofence',         icon: 'geofence',  path: '/superadmin/geofence' },
          { label: 'Payment Detail',   icon: 'payment',   path: '/superadmin/payment-detail' },
          { label: 'Enquiry',          icon: 'enquiry',   path: '/superadmin/enquiry' },
          { label: 'Device Inventory', icon: 'inventory', path: '/superadmin/device-inventory' },
          { type: 'dropdown', label: 'Manage Technician', icon: 'tool',
            items: [
              { label: 'Technician List', icon: 'users',    path: '/superadmin/technician-list' },
              { label: 'JobSheet',        icon: 'document', path: '/superadmin/jobsheet' },
            ]
          },
        ]
      },
      { type: 'dropdown', label: 'Reports', icon: 'reports',
        items: [
          { label: 'Coin Banking',                icon: 'coin',         path: '/superadmin/coin-banking' },
          { label: 'Distance Report',             icon: 'distance',     path: '/superadmin/distance-report' },
          { label: 'Driver Assignment Report',    icon: 'assignment',   path: '/superadmin/driver-assignment-report' },
          { label: 'Expense Report',              icon: 'expense',      path: '/superadmin/expense-report' },
          { label: 'Geofence Report',             icon: 'geofence',     path: '/superadmin/geofence-report' },
          { label: 'Google Map Api Record',       icon: 'map',          path: '/superadmin/google-map-api-record' },
          { label: 'Idle Summary Report',         icon: 'idle',         path: '/superadmin/idle-summary-report' },
          { label: 'Poi Report',                  icon: 'poi',          path: '/superadmin/poi-report' },
          { label: 'Register Mobile Report',      icon: 'mobile',       path: '/superadmin/register-mobile-report' },
          { label: 'Ride Report',                 icon: 'ride',         path: '/superadmin/ride-report' },
          { label: 'Send Command Logs',           icon: 'command',      path: '/superadmin/send-command-logs' },
          { label: 'Sensor Report',               icon: 'sensor',       path: '/superadmin/sensor-report' },
          { label: 'Sim Tracking Report',         icon: 'sim',          path: '/superadmin/sim-tracking-report' },
          { label: 'Speed vs Distance',           icon: 'speed',        path: '/superadmin/speed-vs-distance' },
          { label: 'Status Report',               icon: 'status',       path: '/superadmin/status-report' },
          { label: 'Stoppage Summary Report',     icon: 'stop',         path: '/superadmin/stoppage-summary-report' },
          { label: 'Subscription Changed Report', icon: 'subscription', path: '/superadmin/subscription-changed-report' },
          { label: 'Subscription Expired Report', icon: 'expired',      path: '/superadmin/subscription-expired-report' },
          { label: 'Travel Summary Report',       icon: 'travel',       path: '/superadmin/travel-summary-report' },
          { label: 'Vehicle Log Report',          icon: 'vehicle-log',  path: '/superadmin/vehicle-log-report' },
        ]
      },
      { type: 'dropdown', label: 'Alerts', icon: 'alert',
        items: [
          { label: 'Add Alerts',            icon: 'alert-add',    path: '/superadmin/add-alerts' },
          { label: 'Notification List',     icon: 'notification', path: '/superadmin/notification-list' },
          { label: 'Service & Maintenance', icon: 'maintenance',  path: '/superadmin/service-maintenance' },
          { label: 'Parked Scheduler',      icon: 'parking',      path: '/superadmin/parked-scheduler' },
          { label: 'Announcement',          icon: 'announcement', path: '/superadmin/announcement' },
        ]
      },
      { type: 'dropdown', label: 'Settings', icon: 'settings',
        items: [
          { label: 'Settings',       icon: 'settings',       path: '/superadmin/settings' },
          { label: 'Theme Setting',  icon: 'theme',          path: '/superadmin/theme-setting' },
          { label: 'Vehicle Config', icon: 'vehicle-config', path: '/superadmin/vehicle-config' },
          { label: 'My Profile',     icon: 'profile',        path: '/superadmin/profile' },
          { label: 'Certificate',    icon: 'certificate',    path: '/superadmin/certificate' },
          { label: 'Custom Fields',  icon: 'custom-fields',  path: '/superadmin/custom-fields' },
        ]
      },
      { type: 'dropdown', label: 'Support', icon: 'support',
        items: [
          { label: 'Raise Ticket',   icon: 'ticket', path: '/superadmin/raise-ticket' },
          { label: 'Answer Tickets', icon: 'answer', path: '/superadmin/answer-tickets' },
        ]
      },
      { type: 'dropdown', label: 'Access Management', icon: 'access',
        items: [
          { label: 'Access Management', icon: 'access', path: '/superadmin/access-management' },
        ]
      },
    ],
  },

  admin: {
    label: 'Admin',
    items: [
      { type: 'dropdown', label: 'Home', icon: 'home',
        items: [
          { label: 'Dashboard',           icon: 'dashboard', path: '/admin/dashboard' },
          { label: 'Advance Dashboard',   icon: 'analytics', path: '/admin/advance-dashboard' },
          { label: 'Analytics Dashboard', icon: 'chart',     path: '/admin/analytics-dashboard' },
        ]
      },
      { type: 'dropdown', label: 'Custom Management', icon: 'users',
        items: [
          { label: 'Dealer Management', icon: 'dealer', path: '/admin/dealers' },
          { label: 'User Management',   icon: 'user',   path: '/admin/users' },
        ]
      },
      { type: 'dropdown', label: 'Manage', icon: 'settings',
        items: [
          { label: 'Vehicles',         icon: 'vehicle',   path: '/admin/vehicles' },
          { label: 'Devices',          icon: 'device',    path: '/admin/devices' },
          { label: 'Vehicle Detail',   icon: 'car',       path: '/admin/vehicle-detail' },
          { label: 'Driver Detail',    icon: 'driver',    path: '/admin/driver-detail' },
          { label: 'Geofence',         icon: 'geofence',  path: '/admin/geofence' },
          { label: 'Payment Detail',   icon: 'payment',   path: '/admin/payment-detail' },
          { label: 'Enquiry',          icon: 'enquiry',   path: '/admin/enquiry' },
          { label: 'Device Inventory', icon: 'inventory', path: '/admin/device-inventory' },
          { type: 'dropdown', label: 'Manage Technician', icon: 'tool',
            items: [
              { label: 'Technician List', icon: 'users',    path: '/admin/technician-list' },
              { label: 'JobSheet',        icon: 'document', path: '/admin/jobsheet' },
            ]
          },
        ]
      },
      { type: 'dropdown', label: 'Reports', icon: 'reports',
        items: [
          { label: 'Distance Report',          icon: 'distance',    path: '/admin/distance-report' },
          { label: 'Driver Assignment Report', icon: 'assignment',  path: '/admin/driver-assignment-report' },
          { label: 'Expense Report',           icon: 'expense',     path: '/admin/expense-report' },
          { label: 'Geofence Report',          icon: 'geofence',    path: '/admin/geofence-report' },
          { label: 'Idle Summary Report',      icon: 'idle',        path: '/admin/idle-summary-report' },
          { label: 'Ride Report',              icon: 'ride',        path: '/admin/ride-report' },
          { label: 'Sensor Report',            icon: 'sensor',      path: '/admin/sensor-report' },
          { label: 'Speed vs Distance',        icon: 'speed',       path: '/admin/speed-vs-distance' },
          { label: 'Status Report',            icon: 'status',      path: '/admin/status-report' },
          { label: 'Stoppage Summary Report',  icon: 'stop',        path: '/admin/stoppage-summary-report' },
          { label: 'Travel Summary Report',    icon: 'travel',      path: '/admin/travel-summary-report' },
          { label: 'Vehicle Log Report',       icon: 'vehicle-log', path: '/admin/vehicle-log-report' },
        ]
      },
      { type: 'dropdown', label: 'Alerts', icon: 'alert',
        items: [
          { label: 'Add Alerts',            icon: 'alert-add',    path: '/admin/add-alerts' },
          { label: 'Notification List',     icon: 'notification', path: '/admin/notification-list' },
          { label: 'Service & Maintenance', icon: 'maintenance',  path: '/admin/service-maintenance' },
          { label: 'Parked Scheduler',      icon: 'parking',      path: '/admin/parked-scheduler' },
          { label: 'Announcement',          icon: 'announcement', path: '/admin/announcement' },
        ]
      },
      { type: 'dropdown', label: 'Settings', icon: 'settings',
        items: [
          { label: 'Settings',       icon: 'settings',       path: '/admin/settings' },
          { label: 'Theme Setting',  icon: 'theme',          path: '/admin/theme-setting' },
          { label: 'Vehicle Config', icon: 'vehicle-config', path: '/admin/vehicle-config' },
          { label: 'My Profile',     icon: 'profile',        path: '/admin/profile' },
          { label: 'Certificate',    icon: 'certificate',    path: '/admin/certificate' },
          { label: 'Custom Fields',  icon: 'custom-fields',  path: '/admin/custom-fields' },
        ]
      },
      { type: 'dropdown', label: 'Support', icon: 'support',
        items: [
          { label: 'Raise Ticket',   icon: 'ticket', path: '/admin/raise-ticket' },
          { label: 'Answer Tickets', icon: 'answer', path: '/admin/answer-tickets' },
        ]
      },
      { type: 'dropdown', label: 'Access Management', icon: 'access',
        items: [
          { label: 'Access Management', icon: 'access', path: '/admin/access-management' },
        ]
      },
    ],
  },

  dealer: {
    label: 'Dealer',
    items: [
      { type: 'dropdown', label: 'Home', icon: 'home',
        items: [
          { label: 'Dashboard',           icon: 'dashboard', path: '/dealer/dashboard' },
          { label: 'Advance Dashboard',   icon: 'analytics', path: '/dealer/advance-dashboard' },
          { label: 'Analytics Dashboard', icon: 'chart',     path: '/dealer/analytics-dashboard' },
        ]
      },
      { type: 'dropdown', label: 'Custom Management', icon: 'users',
        items: [
          { label: 'User Management', icon: 'user', path: '/dealer/users' },
        ]
      },
      { type: 'dropdown', label: 'Manage', icon: 'settings',
        items: [
          { label: 'Vehicles',         icon: 'vehicle',   path: '/dealer/vehicles' },
          { label: 'Devices',          icon: 'device',    path: '/dealer/devices' },
          { label: 'Vehicle Detail',   icon: 'car',       path: '/dealer/vehicle-detail' },
          { label: 'Driver Detail',    icon: 'driver',    path: '/dealer/driver-detail' },
          { label: 'Geofence',         icon: 'geofence',  path: '/dealer/geofence' },
          { label: 'Payment Detail',   icon: 'payment',   path: '/dealer/payment-detail' },
          { label: 'Enquiry',          icon: 'enquiry',   path: '/dealer/enquiry' },
          { label: 'Device Inventory', icon: 'inventory', path: '/dealer/device-inventory' },
          { type: 'dropdown', label: 'Manage Technician', icon: 'tool',
            items: [
              { label: 'Technician List', icon: 'users',    path: '/dealer/technician-list' },
              { label: 'JobSheet',        icon: 'document', path: '/dealer/jobsheet' },
            ]
          },
        ]
      },
      { type: 'dropdown', label: 'Reports', icon: 'reports',
        items: [
          { label: 'Distance Report',          icon: 'distance',    path: '/dealer/distance-report' },
          { label: 'Driver Assignment Report', icon: 'assignment',  path: '/dealer/driver-assignment-report' },
          { label: 'Expense Report',           icon: 'expense',     path: '/dealer/expense-report' },
          { label: 'Ride Report',              icon: 'ride',        path: '/dealer/ride-report' },
          { label: 'Status Report',            icon: 'status',      path: '/dealer/status-report' },
          { label: 'Travel Summary Report',    icon: 'travel',      path: '/dealer/travel-summary-report' },
          { label: 'Vehicle Log Report',       icon: 'vehicle-log', path: '/dealer/vehicle-log-report' },
        ]
      },
      { type: 'dropdown', label: 'Alerts', icon: 'alert',
        items: [
          { label: 'Add Alerts',            icon: 'alert-add',    path: '/dealer/add-alerts' },
          { label: 'Notification List',     icon: 'notification', path: '/dealer/notification-list' },
          { label: 'Service & Maintenance', icon: 'maintenance',  path: '/dealer/service-maintenance' },
          { label: 'Parked Scheduler',      icon: 'parking',      path: '/dealer/parked-scheduler' },
          { label: 'Announcement',          icon: 'announcement', path: '/dealer/announcement' },
        ]
      },
      { type: 'dropdown', label: 'Settings', icon: 'settings',
        items: [
          { label: 'Settings',       icon: 'settings',       path: '/dealer/settings' },
          { label: 'Theme Setting',  icon: 'theme',          path: '/dealer/theme-setting' },
          { label: 'Vehicle Config', icon: 'vehicle-config', path: '/dealer/vehicle-config' },
          { label: 'My Profile',     icon: 'profile',        path: '/dealer/profile' },
          { label: 'Certificate',    icon: 'certificate',    path: '/dealer/certificate' },
          { label: 'Custom Fields',  icon: 'custom-fields',  path: '/dealer/custom-fields' },
        ]
      },
      { type: 'dropdown', label: 'Support', icon: 'support',
        items: [
          { label: 'Raise Ticket',   icon: 'ticket', path: '/dealer/raise-ticket' },
          { label: 'Answer Tickets', icon: 'answer', path: '/dealer/answer-tickets' },
        ]
      },
      { type: 'dropdown', label: 'Access Management', icon: 'access',
        items: [
          { label: 'Access Management', icon: 'access', path: '/dealer/access-management' },
        ]
      },
    ],
  },

  user: {
    label: 'User',
    items: [
      { type: 'dropdown', label: 'Home', icon: 'home',
        items: [
          { label: 'Dashboard',           icon: 'dashboard', path: '/user/dashboard' },
          { label: 'Advance Dashboard',   icon: 'analytics', path: '/user/advance-dashboard' },
          { label: 'Analytics Dashboard', icon: 'chart',     path: '/user/analytics-dashboard' },
        ]
      },
      { type: 'dropdown', label: 'Manage', icon: 'settings',
        items: [
          { label: 'Vehicles',       icon: 'vehicle', path: '/user/vehicles' },
          { label: 'Vehicle Detail', icon: 'car',     path: '/user/vehicle-detail' },
          { label: 'Driver Detail',  icon: 'driver',  path: '/user/driver-detail' },
        ]
      },
      { type: 'dropdown', label: 'Reports', icon: 'reports',
        items: [
          { label: 'Distance Report',          icon: 'distance',   path: '/user/distance-report' },
          { label: 'Driver Assignment Report', icon: 'assignment', path: '/user/driver-assignment-report' },
          { label: 'Expense Report',           icon: 'expense',    path: '/user/expense-report' },
          { label: 'Idle Summary Report',      icon: 'idle',       path: '/user/idle-summary-report' },
          { label: 'Ride Report',              icon: 'ride',       path: '/user/ride-report' },
          { label: 'Sensor Report',            icon: 'sensor',     path: '/user/sensor-report' },
          { label: 'Speed vs Distance',        icon: 'speed',      path: '/user/speed-vs-distance' },
          { label: 'Status Report',            icon: 'status',     path: '/user/status-report' },
          { label: 'Stoppage Summary Report',  icon: 'stop',       path: '/user/stoppage-summary-report' },
          { label: 'Travel Summary Report',    icon: 'travel',     path: '/user/travel-summary-report' },
        ]
      },
      { type: 'dropdown', label: 'Alerts', icon: 'alert',
        items: [
          { label: 'Notification List',     icon: 'notification', path: '/user/notification-list' },
          { label: 'Service & Maintenance', icon: 'maintenance',  path: '/user/service-maintenance' },
        ]
      },
      { type: 'dropdown', label: 'Settings', icon: 'settings',
        items: [
          { label: 'Settings',      icon: 'settings', path: '/user/settings' },
          { label: 'Theme Setting', icon: 'theme',    path: '/user/theme-setting' },
          { label: 'My Profile',    icon: 'profile',  path: '/user/profile' },
        ]
      },
      { type: 'dropdown', label: 'Support', icon: 'support',
        items: [
          { label: 'Raise Ticket', icon: 'ticket', path: '/user/raise-ticket' },
        ]
      },
    ],
  },
};

/* ─── Injected global styles once ─── */
const STYLE_ID = 'sidebar-pro-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');

    .sb-scroll::-webkit-scrollbar { width: 3px; }
    .sb-scroll::-webkit-scrollbar-track { background: transparent; }
    .sb-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 10px; }
    .sb-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }

    .sb-nav-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 13.5px;
      font-weight: 500;
      color: rgba(255,255,255,0.72);
      transition: background 180ms ease, color 180ms ease, transform 120ms ease, box-shadow 180ms ease;
      user-select: none;
      white-space: nowrap;
      letter-spacing: 0.01em;
      margin: 1px 0;
      text-decoration: none;
    }
    .sb-nav-item::before {
      content: '';
      position: absolute;
      left: 0; top: 20%; height: 60%; width: 3px;
      border-radius: 0 3px 3px 0;
      background: transparent;
      transition: background 180ms ease, height 180ms ease, top 180ms ease;
    }
    .sb-nav-item:hover { background: rgba(255,255,255,0.10); color: #ffffff; transform: translateX(2px); }
    .sb-nav-item:hover::before { background: rgba(255,255,255,0.45); height: 50%; top: 25%; }
    .sb-nav-item:active { transform: translateX(1px) scale(0.99); }
    .sb-nav-item.active {
      background: rgba(255,255,255,0.16); color: #ffffff; font-weight: 600;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.12);
    }
    .sb-nav-item.active::before { background: #ffffff; height: 60%; top: 20%; }

    .sb-dropdown-header {
      position: relative;
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-radius: 10px;
      cursor: pointer; font-size: 13.5px; font-weight: 500;
      color: rgba(255,255,255,0.72);
      transition: background 180ms ease, color 180ms ease, transform 120ms ease;
      user-select: none; white-space: nowrap; letter-spacing: 0.01em; margin: 1px 0;
    }
    .sb-dropdown-header::before {
      content: '';
      position: absolute; left: 0; top: 20%; height: 60%; width: 3px;
      border-radius: 0 3px 3px 0; background: transparent;
      transition: background 180ms ease;
    }
    .sb-dropdown-header:hover { background: rgba(255,255,255,0.10); color: #ffffff; transform: translateX(2px); }
    .sb-dropdown-header:hover::before { background: rgba(255,255,255,0.45); }
    .sb-dropdown-header.open { background: rgba(255,255,255,0.13); color: #ffffff; font-weight: 600; }
    .sb-dropdown-header.open::before { background: #ffffff; }

    .sb-chevron {
      margin-left: auto; opacity: 0.55;
      transition: transform 240ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease;
      flex-shrink: 0;
    }
    .sb-chevron.open { transform: rotate(180deg); opacity: 0.9; }

    .sb-children { overflow: hidden; transition: max-height 280ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease; opacity: 0; max-height: 0; }
    .sb-children.open { opacity: 1; max-height: 2000px; }
    .sb-children-inner { padding: 3px 0 4px 12px; margin: 0 0 2px 10px; border-left: 1px solid rgba(255,255,255,0.13); }

    .sb-sub-item {
      position: relative; display: flex; align-items: center; gap: 9px;
      padding: 8px 12px; border-radius: 8px; cursor: pointer;
      font-size: 12.5px; font-weight: 400; color: rgba(255,255,255,0.62);
      transition: background 160ms ease, color 160ms ease, transform 120ms ease;
      white-space: nowrap; text-decoration: none; margin: 1px 0; letter-spacing: 0.01em;
    }
    .sb-sub-item::before {
      content: ''; position: absolute; left: 0; top: 25%; height: 50%; width: 2px;
      border-radius: 0 2px 2px 0; background: transparent; transition: background 160ms ease;
    }
    .sb-sub-item:hover { background: rgba(255,255,255,0.09); color: #ffffff; transform: translateX(2px); }
    .sb-sub-item:hover::before { background: rgba(255,255,255,0.4); }
    .sb-sub-item.active { background: rgba(255,255,255,0.14); color: #ffffff; font-weight: 600; }
    .sb-sub-item.active::before { background: rgba(255,255,255,0.9); }

    .sb-search-input {
      border: none; background: transparent; font-size: 12.5px; color: #ffffff;
      outline: none; width: 100%; font-family: 'DM Sans', sans-serif; letter-spacing: 0.01em;
    }
    .sb-search-input::placeholder { color: rgba(255,255,255,0.42); }

    .sb-logo-pulse { animation: logoPulse 3s ease-in-out infinite; }
    @keyframes logoPulse {
      0%, 100% { filter: drop-shadow(0 3px 10px rgba(0,0,0,0.35)); }
      50%       { filter: drop-shadow(0 3px 16px rgba(255,255,255,0.12)); }
    }

    .sb-badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
      background: rgba(255,255,255,0.22); font-size: 10px; font-weight: 700;
      color: #fff; margin-left: auto; letter-spacing: 0;
    }

    .sb-section-label {
      font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(255,255,255,0.35);
      padding: 10px 14px 4px; user-select: none;
    }

    .sb-logout-btn {
      position: relative; display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-radius: 10px; cursor: pointer;
      font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,0.65);
      background: transparent; border: none; width: 100%;
      transition: background 180ms ease, color 180ms ease, transform 120ms ease;
      letter-spacing: 0.01em; font-family: 'DM Sans', sans-serif;
    }
    .sb-logout-btn:hover { background: rgba(255,80,80,0.18); color: #ffaaaa; transform: translateX(2px); }

    .sb-no-results {
      text-align: center; padding: 20px 16px; color: rgba(255,255,255,0.35);
      font-size: 12.5px; letter-spacing: 0.01em;
    }

    .sb-highlight { background: rgba(255,255,255,0.22); border-radius: 3px; padding: 0 1px; color: #fff; }

    /* ── Mobile / Tablet slide-in ── */
    @media (max-width: 1023px) {
      .sb-sidebar {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        height: 100dvh !important;
        z-index: 999 !important;
        transform: translateX(-100%) !important;
        transition: transform 300ms cubic-bezier(0.4,0,0.2,1), background 0.4s ease !important;
        box-shadow: 6px 0 40px rgba(0,0,0,0.45) !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      .sb-sidebar.sb-open {
        transform: translateX(0) !important;
      }
      .sb-sidebar .sb-dropdown-header,
      .sb-sidebar .sb-nav-item,
      .sb-sidebar .sb-logout-btn {
        justify-content: flex-start !important;
        padding: 10px 14px !important;
      }
      .sb-sidebar .sb-logout-btn {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      .sb-sidebar .sb-chevron { display: block !important; }
    }

    @media (max-width: 767px) {
      .sb-sidebar { width: 272px !important; }
    }
    @media (min-width: 768px) and (max-width: 1023px) {
      .sb-sidebar { width: 264px !important; }
    }

    /* ── Laptop: icon-only collapsed ── */
    @media (min-width: 1024px) and (max-width: 1279px) {
      .sb-sidebar:not(.sb-force-expanded) {
        width: 68px !important;
      }
    }

    /* ── Overlay backdrop ── */
    .sb-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.52);
      z-index: 998;
      animation: sbOvIn 200ms ease forwards;
    }
    .sb-overlay.active { display: block; }
    @keyframes sbOvIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

/* ─── Helpers ─── */
const escapeReg = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text, query) => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeReg(query)})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="sb-highlight">{p}</mark>
      : p
  );
};

const collectMatches = (items, query) => {
  const q = query.toLowerCase();
  const results = [];
  const walk = arr => arr.forEach(item => {
    if (item.type === 'dropdown') walk(item.items);
    else if (item.label.toLowerCase().includes(q)) results.push(item);
  });
  walk(items);
  return results;
};

/* ─── useWindowWidth hook ─── */
const useWindowWidth = () => {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
};

/* ─── Component ─── */
const Sidebar = ({ isOpen, onClose, onToggle }) => {
  const { user, logout }                            = useAuth();
  const { activeColor, activeGradient, isGradient } = useTheme();
  const { companyName, logoUrl }                    = useBranding();
  const navigate                                    = useNavigate();
  const [openDropdowns, setOpenDropdowns]           = useState({});
  const [searchQuery, setSearchQuery]               = useState('');
  const searchRef                                   = useRef(null);
  const windowWidth                                 = useWindowWidth();

  /* Breakpoints */
  const isMobile  = windowWidth < 768;
  const isTablet  = windowWidth >= 768 && windowWidth < 1024;
  const isLaptop  = windowWidth >= 1024 && windowWidth < 1280;
  const isDesktop = windowWidth >= 1280;

  const isOverlayMode = isMobile || isTablet;
  const collapsed     = isLaptop ? !isOpen : (!isDesktop ? false : !isOpen);
  const showFull      = isOverlayMode ? true : !collapsed;

  const config    = SIDEBAR_CONFIG[user?.role] || SIDEBAR_CONFIG.user;
  const sidebarBg = isGradient ? activeGradient : activeColor;

  const toggleDropdown = label =>
    setOpenDropdowns(prev => ({ ...prev, [label]: !prev[label] }));

  const handleLogout = () => {
    window.dispatchEvent(new Event('app:logout')); // ← add this line
    logout();
    navigate('/login');
    if (onClose) onClose();
  };

  const handleNavClick = () => {
    if (isOverlayMode && onClose) onClose();
  };

  useEffect(() => {
    if (collapsed) setSearchQuery('');
  }, [collapsed]);

  useEffect(() => {
    if (isDesktop && onClose) onClose();
  }, [isDesktop]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return collectMatches(config.items, searchQuery.trim());
  }, [searchQuery, config.items]);

  const sidebarClass = [
    'sb-sidebar',
    isOpen ? 'sb-open' : '',
    (isLaptop && isOpen) ? 'sb-force-expanded' : '',
  ].filter(Boolean).join(' ');

  const sidebarWidth = (() => {
    if (isOverlayMode) return '272px';
    if (isLaptop) return isOpen ? '264px' : '68px';
    return isOpen ? '264px' : '68px';
  })();

  /* ── Search result row ── */
  const renderSearchResult = (item, idx) => (
    <NavLink
      key={idx}
      to={item.path}
      className={({ isActive }) => `sb-sub-item${isActive ? ' active' : ''}`}
      onClick={() => { setSearchQuery(''); handleNavClick(); }}
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} size={15} color={isActive ? '#fff' : 'rgba(255,255,255,0.62)'} />
          <span>{highlightText(item.label, searchQuery)}</span>
        </>
      )}
    </NavLink>
  );

  /* ── Nav item renderer ── */
  const renderNavItem = (item, index) => {
    if (item.type === 'dropdown') {
      const isDropOpen = !!openDropdowns[item.label];
      const isNested   = typeof index === 'string' && index.startsWith('sub-');

      return (
        <div key={index}>
          <div
            className={`sb-dropdown-header${isDropOpen ? ' open' : ''}`}
            onClick={() => toggleDropdown(item.label)}
            title={(!showFull) ? item.label : undefined}
            style={(!showFull) ? { justifyContent: 'center', padding: '12px 0' } : {}}
          >
            <Icon name={item.icon} size={isNested ? 16 : 18}
              color={isDropOpen ? '#fff' : 'rgba(255,255,255,0.72)'} />
            {showFull && (
              <>
                <span style={{ flex: 1 }}>{item.label}</span>
                <svg className={`sb-chevron${isDropOpen ? ' open' : ''}`}
                  width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </div>

          {showFull && (
            <div className={`sb-children${isDropOpen ? ' open' : ''}`}>
              <div className="sb-children-inner">
                {item.items.map((subItem, subIndex) => {
                  if (subItem.type === 'dropdown')
                    return renderNavItem(subItem, `sub-${subIndex}`);
                  return (
                    <NavLink
                      key={subIndex}
                      to={subItem.path}
                      className={({ isActive }) => `sb-sub-item${isActive ? ' active' : ''}`}
                      onClick={handleNavClick}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon name={subItem.icon} size={15}
                            color={isActive ? '#fff' : 'rgba(255,255,255,0.62)'} />
                          <span>{subItem.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={index}
        to={item.path}
        className={({ isActive }) => `sb-nav-item${isActive ? ' active' : ''}`}
        title={(!showFull) ? item.label : undefined}
        style={(!showFull) ? { justifyContent: 'center', padding: '12px 0' } : {}}
        onClick={handleNavClick}
      >
        {({ isActive }) => (
          <>
            <Icon name={item.icon} size={18} color={isActive ? '#fff' : 'rgba(255,255,255,0.72)'} />
            {showFull && item.label}
          </>
        )}
      </NavLink>
    );
  };

  /* ── Logo image to show: branding logoUrl takes priority, fallback to local asset ── */
  const logoSrc = logoUrl || defaultLogo;

  return (
    <>
      {/* Overlay backdrop (mobile/tablet only) */}
      {isOverlayMode && (
        <div
          className={`sb-overlay${isOpen ? ' active' : ''}`}
          onClick={onClose}
        />
      )}

      <aside
        className={sidebarClass}
        style={{
          width:         sidebarWidth,
          minHeight:     '100vh',
          background:    sidebarBg,
          display:       'flex',
          flexDirection: 'column',
          transition:    'width 280ms cubic-bezier(0.4,0,0.2,1), background 0.4s ease',
          overflow:      'hidden',
          flexShrink:    0,
          position:      'relative',
          zIndex:        10,
          boxShadow:     '3px 0 20px rgba(0,0,0,0.22)',
          fontFamily:    "'DM Sans', sans-serif",
        }}
      >
        {/* Ambient overlays */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, transparent 55%)',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.14) 0%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ─── Logo Area ─── */}
        <div style={{
          minHeight:      showFull ? '92px' : '68px',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        showFull ? '14px 16px 12px' : '12px 0',
          borderBottom:   '1px solid rgba(255,255,255,0.09)',
          flexShrink:     0,
          position:       'relative',
          zIndex:         1,
          gap:            5,
          transition:     'min-height 280ms ease, padding 280ms ease',
        }}>

          {/* Ambient top-left glow */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, transparent 55%)',
          }} />

          {/* Logo image — natural size, no container, no zoom */}
          <img
            src={logoSrc}
            alt={companyName || 'Logo'}
            style={{
              height:     showFull ? 42 : 34,
              width:      'auto',
              maxWidth:   showFull ? '140px' : '44px',
              objectFit:  'contain',
              flexShrink: 0,
              transition: 'height 280ms ease, max-width 280ms ease',
            }}
          />

          {/* Company name — line1 with side dividers, line2 muted below */}
          {showFull && (
            <div style={{
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'center',
              gap:           3,
              marginTop:     4,
              width:         '100%',
              padding:       '0 12px',
            }}>
              {/* ── SRISHTI with side lines ── */}
              <div style={{
                display:        'flex',
                alignItems:     'center',
                gap:            7,
                width:          '100%',
                justifyContent: 'center',
              }}>
                <div style={{
                  flex:            1,
                  height:          '1px',
                  background:      'rgba(255,255,255,0.22)',
                  borderRadius:    1,
                }} />
                <div style={{
                  fontSize:      15,
                  fontWeight:    700,
                  letterSpacing: '0.18em',
                  color:         'rgba(255,255,255,0.93)',
                  textTransform: 'uppercase',
                  lineHeight:    1,
                  whiteSpace:    'nowrap',
                }}>
                  {companyName
                    ? companyName.split(' ')[0].toUpperCase()
                    : 'SRISHTI'}
                </div>
                <div style={{
                  flex:            1,
                  height:          '1px',
                  background:      'rgba(255,255,255,0.22)',
                  borderRadius:    1,
                }} />
              </div>

              {/* ── WIRELESS SOLUTION muted below ── */}
              <div style={{
                fontSize:      11,
                fontWeight:    500,
                letterSpacing: '0.13em',
                color:         'rgba(255,255,255,0.38)',
                textTransform: 'uppercase',
                lineHeight:    1,
                textAlign:     'center',
                whiteSpace:    'nowrap',
              }}>
                {companyName
                  ? companyName.split(' ').slice(1).join(' ').toUpperCase()
                  : 'WIRELESS SOLUTION'}
              </div>
            </div>
          )}

          {/* Collapse button — desktop/laptop only, top-right */}
          {showFull && !isOverlayMode && (
            <button
              onClick={onToggle}
              style={{
                position:       'absolute',
                top:            10,
                right:          10,
                background:     'rgba(255,255,255,0.07)',
                border:         '1px solid rgba(255,255,255,0.10)',
                borderRadius:   6,
                width:          24,
                height:         24,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         'pointer',
                color:          'rgba(255,255,255,0.45)',
                flexShrink:     0,
                transition:     'background 150ms, color 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
              title="Collapse sidebar"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Close button — mobile/tablet overlay, top-right */}
          {showFull && isOverlayMode && (
            <button
              onClick={onClose}
              style={{
                position:       'absolute',
                top:            10,
                right:          10,
                background:     'rgba(255,255,255,0.07)',
                border:         '1px solid rgba(255,255,255,0.10)',
                borderRadius:   6,
                width:          26,
                height:         26,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         'pointer',
                color:          'rgba(255,255,255,0.60)',
                flexShrink:     0,
                transition:     'background 150ms, color 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.18)'; e.currentTarget.style.color = '#ffaaaa'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; }}
              title="Close menu"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Search */}
        {showFull && (
          <div style={{
            padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            position: 'relative', zIndex: 1,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.09)', borderRadius: 9,
              padding: '8px 12px',
              border: `1px solid ${searchQuery ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)'}`,
              transition: 'border-color 180ms ease', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                style={{ flexShrink: 0, color: 'rgba(255,255,255,0.45)' }}>
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                className="sb-search-input"
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                    width: 16, height: 16, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.8)',
                    flexShrink: 0, padding: 0, transition: 'background 150ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="sb-scroll" style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: (!showFull) ? '10px 8px' : '10px 10px',
          position: 'relative', zIndex: 1,
        }}>
          {searchResults !== null ? (
            searchResults.length === 0 ? (
              <div className="sb-no-results">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                  style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }}>
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                No results for<br />
                <strong style={{ color: 'rgba(255,255,255,0.5)' }}>"{searchQuery}"</strong>
              </div>
            ) : (
              <>
                <div className="sb-section-label">{searchResults.length} Result{searchResults.length !== 1 ? 's' : ''}</div>
                {searchResults.map((item, i) => renderSearchResult(item, i))}
              </>
            )
          ) : (
            config.items.map((item, i) => renderNavItem(item, i))
          )}
        </nav>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', flexShrink: 0, position: 'relative', zIndex: 1 }} />

        {/* Logout */}
        <div style={{ flexShrink: 0, padding: '8px 10px', position: 'relative', zIndex: 1 }}>
          <button
            className="sb-logout-btn"
            onClick={handleLogout}
            title={(!showFull) ? 'Logout' : undefined}
            style={(!showFull) ? { justifyContent: 'center', padding: '12px 0' } : {}}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showFull && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;