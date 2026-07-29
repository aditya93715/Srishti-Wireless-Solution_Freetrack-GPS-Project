const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  DEALER: 'dealer',
  USER: 'user',
};

const ROLE_HIERARCHY = {
  super_admin: 4,
  admin: 3,
  dealer: 2,
  user: 1,
};

const ROLE_DASHBOARD_PATHS = {
  super_admin: '/superadmin/dashboard',
  admin: '/admin/dashboard',
  dealer: '/dealer/dashboard',
  user: '/user/dashboard',
};

const ALL_FEATURES = [
  'dashboard',
  'live_tracking',
  'vehicle_list',
  'ticket_raise',
  'ticket_manage',
  'reports',
  'history',
  'analytics',
  'user_management',
  'device_management',
  'settings',
  'notifications',
  'billing',
  'subscription_plans',
  'admin_management',
  'dealer_management',
  'geofence',
  'alerts',
  'maintenance',
  'fuel_monitoring',
  'playback',
  'drivers',
];

const ROLE_DEFAULT_FEATURES = {
  super_admin: ALL_FEATURES,
  admin: [
    'dashboard', 'live_tracking', 'vehicle_list', 'reports', 'history',
    'analytics', 'user_management', 'device_management', 'notifications',
    'dealer_management', 'geofence', 'alerts', 'maintenance', 'playback', 'drivers',
  ],
  dealer: [
    'dashboard', 'live_tracking', 'vehicle_list', 'reports', 'history',
    'notifications', 'user_management', 'alerts', 'playback', 'drivers', 'geofence',
  ],
  user: [
    'dashboard', 'live_tracking', 'vehicle_list', 'reports', 'history',
    'notifications', 'alerts', 'playback',
  ],
};

const CREATABLE_ROLES = {
  super_admin: 'admin',
  admin: 'dealer',
  dealer: 'user',
  user: null,
};

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  ROLE_DASHBOARD_PATHS,
  ALL_FEATURES,
  ROLE_DEFAULT_FEATURES,
  CREATABLE_ROLES,
};
