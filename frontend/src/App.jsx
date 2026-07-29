import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute, RoleRoute, PublicRoute } from './routes/guards';
import DashboardLayout from './components/DashboardLayout';

// Pages
import LoginPage from './dashboards/LoginPage';
import Unauthorized from './dashboards/Unauthorized';
import ProfilePage from './dashboards/ProfilePage';

// ==================== SUPERADMIN IMPORTS ====================
import SuperAdminDashboard from './dashboards/Superadmin/Home/Dashboard';
import SuperAdminAdvanceDashboard from './dashboards/Superadmin/Home/AdvanceDashboard';
import SuperAdminAnalyticsDashboard from './dashboards/Superadmin/Home/AnalyticsDashboard';
import AdminManagement from './dashboards/Superadmin/Custom Management/AdminManagement';
import DealerManagementPage from './dashboards/Superadmin/Custom Management/DealerManagement';
import UserManagementPage from './dashboards/Superadmin/Custom Management/UserManagement';
import SuperAdminVehicles from './dashboards/Superadmin/Manage/Vehicles';
import SuperAdminDevices from './dashboards/Superadmin/Manage/Devices';
import SuperAdminTechnicianList from "./dashboards/Superadmin/Manage/Manage Technicien/TechnicianList";
import SuperAdminJobsheet from './dashboards/Superadmin/Manage/Manage Technicien/Jobsheet';
import SuperAdminVehicleDetail from './dashboards/Superadmin/Manage/VehicleDetail';
import SuperAdminDriverDetailPage from './dashboards/Superadmin/Manage/DriverDetailPage';
import SuperAdminGeofence from './dashboards/Superadmin/Manage/Geofence';
import SuperAdminPaymentDetail from './dashboards/Superadmin/Manage/PaymentDetail';
import SuperAdminEnquiry from './dashboards/Superadmin/Manage/Enquiry';
import SuperAdminDeviceInventory from './dashboards/Superadmin/Manage/Device Inventory/DeviceInventory';
import SuperAdminCoinBanking from './dashboards/Superadmin/Reports/CoinBanking';
import SuperAdminDistanceReport from './dashboards/Superadmin/Reports/DistanceReport';
import SuperAdminDriverAssignmentReport from './dashboards/Superadmin/Reports/DriverAssignmentReport';
import SuperAdminExpenseReport from './dashboards/Superadmin/Reports/ExpenseReport';
import SuperAdminGeofenceReport from './dashboards/Superadmin/Reports/GeofenceReport';
import SuperAdminGoogleMapApiRecord from './dashboards/Superadmin/Reports/GoogleMapApiRecord';
import SuperAdminIdleSummaryReport from './dashboards/Superadmin/Reports/IdleSummaryReport';
import SuperAdminPoiReport from './dashboards/Superadmin/Reports/PoiReport';
import SuperAdminRegisterMobileReport from './dashboards/Superadmin/Reports/RegisterMobileReport';
import SuperAdminRideReport from './dashboards/Superadmin/Reports/RideReport';
import SuperAdminSendCommandLogs from './dashboards/Superadmin/Reports/SendCommandLogs';
import SuperAdminSensorReport from './dashboards/Superadmin/Reports/SensorReport';
import SuperAdminSimTrackingReport from './dashboards/Superadmin/Reports/SimTrackingReport';
import SuperAdminSpeedVsDistance from './dashboards/Superadmin/Reports/SpeedVsDistance';
import SuperAdminStatusReport from './dashboards/Superadmin/Reports/StatusReport';
import SuperAdminStoppageSummaryReport from './dashboards/Superadmin/Reports/StoppageSummaryReport';
import SuperAdminSubscriptionChangedReport from './dashboards/Superadmin/Reports/SubscriptionChangedReport';
import SuperAdminSubscriptionExpiredReport from './dashboards/Superadmin/Reports/SubscriptionExpiredReport';
import SuperAdminTravelSummaryReport from './dashboards/Superadmin/Reports/TravelSummaryReport';
import SuperAdminVehicleLogReport from './dashboards/Superadmin/Reports/VehicleLogReport';
import SuperAdminAddAlerts from './dashboards/Superadmin/Alerts/AddAlerts';
import SuperAdminNotificationList from './dashboards/Superadmin/Alerts/NotificationList';
import SuperAdminServiceMaintenance from './dashboards/Superadmin/Alerts/ServiceMaintenance';
import SuperAdminParkedScheduler from './dashboards/Superadmin/Alerts/ParkedScheduler';
import SuperAdminAnnouncement from './dashboards/Superadmin/Alerts/Announcement';
import SuperAdminSettings from './dashboards/Superadmin/Settings/Settings';
import SuperAdminThemeSetting from './dashboards/Superadmin/Settings/ThemeSetting';
import SuperAdminVehicleConfig from './dashboards/Superadmin/Settings/VehicleConfig';
import SuperAdminCertificate from './dashboards/Superadmin/Settings/Certificate';
import SuperAdminCustomFields from './dashboards/Superadmin/Settings/CustomFields';
import SuperAdminMyProfile from './dashboards/Superadmin/Settings/MyProfile';
import SuperAdminRaiseTicket from './dashboards/Superadmin/Support/RaiseTicket';
import SuperAdminAnswerTickets from './dashboards/Superadmin/Support/AnswerTickets';
import SuperAdminAccessManagement from './dashboards/Superadmin/Access Management/AccessManagement';

// ==================== ADMIN IMPORTS ====================
import AdminDashboard from './dashboards/Admin/Home/Dashboard';
import AdminAdvanceDashboard from './dashboards/Admin/Home/AdvanceDashboard';
import AdminAnalyticsDashboard from './dashboards/Admin/Home/AnalyticsDashboard';
import AdminDealerManagement from './dashboards/Admin/Custom Management/DealerManagement';
import AdminUserManagement from './dashboards/Admin/Custom Management/UserManagement';
import AdminVehicles from './dashboards/Admin/Manage/Vehicles';
import AdminDevices from './dashboards/Admin/Manage/Devices';
import AdminTechnicianList from './dashboards/Admin/Manage/Manage Technicien/TechnicianList';
import AdminJobsheet from './dashboards/Admin/Manage/Manage Technicien/Jobsheet';
import AdminVehicleDetail from './dashboards/Admin/Manage/VehicleDetail';
import AdminDriverDetailPage from './dashboards/Admin/Manage/DriverDetailPage';
import AdminGeofence from './dashboards/Admin/Manage/Geofence';
import AdminPaymentDetail from './dashboards/Admin/Manage/PaymentDetail';
import AdminEnquiry from './dashboards/Admin/Manage/Enquiry';
import AdminDeviceInventory from './dashboards/Admin/Manage/DeviceInventory';
import AdminCoinBanking from './dashboards/Admin/Reports/CoinBanking';
import AdminDistanceReport from './dashboards/Admin/Reports/DistanceReport';
import AdminDriverAssignmentReport from './dashboards/Admin/Reports/DriverAssignmentReport';
import AdminExpenseReport from './dashboards/Admin/Reports/ExpenseReport';
import AdminGeofenceReport from './dashboards/Admin/Reports/GeofenceReport';
import AdminGoogleMapApiRecord from './dashboards/Admin/Reports/GoogleMapApiRecord';
import AdminIdleSummaryReport from './dashboards/Admin/Reports/IdleSummaryReport';
import AdminPoiReport from './dashboards/Admin/Reports/PoiReport';
import AdminRegisterMobileReport from './dashboards/Admin/Reports/RegisterMobileReport';
import AdminRideReport from './dashboards/Admin/Reports/RideReport';
import AdminSendCommandLogs from './dashboards/Admin/Reports/SendCommandLogs';
import AdminSensorReport from './dashboards/Admin/Reports/SensorReport';
import AdminSimTrackingReport from './dashboards/Admin/Reports/SimTrackingReport';
import AdminSpeedVsDistance from './dashboards/Admin/Reports/SpeedVsDistance';
import AdminStatusReport from './dashboards/Admin/Reports/StatusReport';
import AdminStoppageSummaryReport from './dashboards/Admin/Reports/StoppageSummaryReport';
import AdminSubscriptionChangedReport from './dashboards/Admin/Reports/SubscriptionChangedReport';
import AdminSubscriptionExpiredReport from './dashboards/Admin/Reports/SubscriptionExpiredReport';
import AdminTravelSummaryReport from './dashboards/Admin/Reports/TravelSummaryReport';
import AdminVehicleLogReport from './dashboards/Admin/Reports/VehicleLogReport';
import AdminAddAlerts from './dashboards/Admin/Alerts/AddAlerts';
import AdminNotificationList from './dashboards/Admin/Alerts/NotificationList';
import AdminServiceMaintenance from './dashboards/Admin/Alerts/ServiceMaintenance';
import AdminParkedScheduler from './dashboards/Admin/Alerts/ParkedScheduler';
import AdminAnnouncement from './dashboards/Admin/Alerts/Announcement';
import AdminSettings from './dashboards/Admin/Settings/Settings';
import AdminThemeSetting from './dashboards/Admin/Settings/ThemeSetting';
import AdminVehicleConfig from './dashboards/Admin/Settings/VehicleConfig';
import AdminCertificate from './dashboards/Admin/Settings/Certificate';
import AdminCustomFields from './dashboards/Admin/Settings/CustomFields';
import AdminRaiseTicket from './dashboards/Admin/Support/RaiseTicket';
import AdminAnswerTickets from './dashboards/Admin/Support/AnswerTickets';
import AdminAccessManagement from './dashboards/Admin/Access Management/AccessManagement';

// ==================== DEALER IMPORTS ====================
import DealerDashboard from './dashboards/Dealer/Home/Dashboard';
import DealerAdvanceDashboard from './dashboards/Dealer/Home/AdvanceDashboard';
import DealerAnalyticsDashboard from './dashboards/Dealer/Home/AnalyticsDashboard';
import DealerUserManagement from './dashboards/Dealer/Custom Management/UserManagement';
import DealerVehicles from './dashboards/Dealer/Manage/Vehicles';
import DealerDevices from './dashboards/Dealer/Manage/Devices';
import DealerTechnicianList from './dashboards/Dealer/Manage/Manage Technicien/TechnicianList';
import DealerJobsheet from './dashboards/Dealer/Manage/Manage Technicien/Jobsheet';
import DealerVehicleDetail from './dashboards/Dealer/Manage/VehicleDetail';
import DealerDriverDetailPage from './dashboards/Dealer/Manage/DriverDetailPage';
import DealerGeofence from './dashboards/Dealer/Manage/Geofence';
import DealerPaymentDetail from './dashboards/Dealer/Manage/PaymentDetail';
import DealerEnquiry from './dashboards/Dealer/Manage/Enquiry';
import DealerDeviceInventory from './dashboards/Dealer/Manage/DeviceInventory';
import DealerCoinBanking from './dashboards/Dealer/Reports/CoinBanking';
import DealerDistanceReport from './dashboards/Dealer/Reports/DistanceReport';
import DealerDriverAssignmentReport from './dashboards/Dealer/Reports/DriverAssignmentReport';
import DealerExpenseReport from './dashboards/Dealer/Reports/ExpenseReport';
import DealerGeofenceReport from './dashboards/Dealer/Reports/GeofenceReport';
import DealerGoogleMapApiRecord from './dashboards/Dealer/Reports/GoogleMapApiRecord';
import DealerIdleSummaryReport from './dashboards/Dealer/Reports/IdleSummaryReport';
import DealerPoiReport from './dashboards/Dealer/Reports/PoiReport';
import DealerRegisterMobileReport from './dashboards/Dealer/Reports/RegisterMobileReport';
import DealerRideReport from './dashboards/Dealer/Reports/RideReport';
import DealerSendCommandLogs from './dashboards/Dealer/Reports/SendCommandLogs';
import DealerSensorReport from './dashboards/Dealer/Reports/SensorReport';
import DealerSimTrackingReport from './dashboards/Dealer/Reports/SimTrackingReport';
import DealerSpeedVsDistance from './dashboards/Dealer/Reports/SpeedVsDistance';
import DealerStatusReport from './dashboards/Dealer/Reports/StatusReport';
import DealerStoppageSummaryReport from './dashboards/Dealer/Reports/StoppageSummaryReport';
import DealerSubscriptionChangedReport from './dashboards/Dealer/Reports/SubscriptionChangedReport';
import DealerSubscriptionExpiredReport from './dashboards/Dealer/Reports/SubscriptionExpiredReport';
import DealerTravelSummaryReport from './dashboards/Dealer/Reports/TravelSummaryReport';
import DealerVehicleLogReport from './dashboards/Dealer/Reports/VehicleLogReport';
import DealerAddAlerts from './dashboards/Dealer/Alerts/AddAlerts';
import DealerNotificationList from './dashboards/Dealer/Alerts/NotificationList';
import DealerServiceMaintenance from './dashboards/Dealer/Alerts/ServiceMaintenance';
import DealerParkedScheduler from './dashboards/Dealer/Alerts/ParkedScheduler';
import DealerAnnouncement from './dashboards/Dealer/Alerts/Announcement';
import DealerSettings from './dashboards/Dealer/Settings/Settings';
import DealerThemeSetting from './dashboards/Dealer/Settings/ThemeSetting';
import DealerVehicleConfig from './dashboards/Dealer/Settings/VehicleConfig';
import DealerCertificate from './dashboards/Dealer/Settings/Certificate';
import DealerCustomFields from './dashboards/Dealer/Settings/CustomFields';
import DealerRaiseTicket from './dashboards/Dealer/Support/RaiseTicket';
import DealerAnswerTickets from './dashboards/Dealer/Support/AnswerTickets';
import DealerAccessManagement from './dashboards/Dealer/Access Management/AccessManagement';

// ==================== ENDUSER IMPORTS ====================
import EndUserDashboard from './dashboards/EndUser/Home/Dashboard';
import EndUserAdvanceDashboard from './dashboards/EndUser/Home/AdvanceDashboard';
import EndUserAnalyticsDashboard from './dashboards/EndUser/Home/AnalyticsDashboard';
import EndUserVehicles from './dashboards/EndUser/Manage/Vehicles';
import EndUserVehicleDetail from './dashboards/EndUser/Manage/VehicleDetail';
import EndUserDriverDetailPage from './dashboards/EndUser/Manage/DriverDetailPage';
import EndUserDistanceReport from './dashboards/EndUser/Reports/DistanceReport';
import EndUserDriverAssignmentReport from './dashboards/EndUser/Reports/DriverAssignmentReport';
import EndUserExpenseReport from './dashboards/EndUser/Reports/ExpenseReport';
import EndUserIdleSummaryReport from './dashboards/EndUser/Reports/IdleSummaryReport';
import EndUserRideReport from './dashboards/EndUser/Reports/RideReport';
import EndUserSensorReport from './dashboards/EndUser/Reports/SensorReport';
import EndUserSpeedVsDistance from './dashboards/EndUser/Reports/SpeedVsDistance';
import EndUserStatusReport from './dashboards/EndUser/Reports/StatusReport';
import EndUserStoppageSummaryReport from './dashboards/EndUser/Reports/StoppageSummaryReport';
import EndUserTravelSummaryReport from './dashboards/EndUser/Reports/TravelSummaryReport';
import EndUserNotificationList from './dashboards/EndUser/Alerts/NotificationList';
import EndUserServiceMaintenance from './dashboards/EndUser/Alerts/ServiceMaintenance';
import EndUserSettings from './dashboards/EndUser/Settings/Settings';
import EndUserThemeSetting from './dashboards/EndUser/Settings/ThemeSetting';
import EndUserMyProfile from './dashboards/EndUser/Settings/MyProfile';
import EndUserRaiseTicket from './dashboards/EndUser/Support/RaiseTicket';

// ==================== SHARED IMPORTS ====================
import {
  LiveTrackingPage,
  PlaybackPage,
  AlertsPage,
  ReportsPage,
  DriversPage,
  MaintenancePage,
  FuelPage,
  BillingPage,
  PlansPage,
  SettingsPage,
} from './dashboards/SharedPages';

// ─────────────────────────────────────────────────────────────────────────────
// ThemedApp — reads role + userId from auth, passes both to ThemeProvider.
//
// Storage key formula: "app_theme_v3_{role}_{userId}"
//
// Result:
//   Admin A  (id: abc) → "app_theme_v3_admin_abc"   ← their own theme
//   Admin B  (id: xyz) → "app_theme_v3_admin_xyz"   ← completely separate
//   Dealer A (id: def) → "app_theme_v3_dealer_def"  ← isolated
//   SuperAdmin (id: 99) → "app_theme_v3_super_admin_99" ← isolated
// ─────────────────────────────────────────────────────────────────────────────
function ThemedApp() {
  const { user } = useAuth();

  // role   → 'super_admin' | 'admin' | 'dealer' | 'user' | 'default'
  // userId → MongoDB _id string from your backend e.g. "507f1f77bcf86cd799439011"
  //          Falls back through _id → id → 'guest' to handle any API shape
  const role   = user?.role  || 'default';
  const userId = user?._id   || user?.id || 'guest';

  return (
    // Both role AND userId passed — ThemeProvider creates a unique key per person
    <ThemeProvider role={role} userId={userId}>
      <Routes>

        {/* ==================== PUBLIC ROUTES ==================== */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ==================== SUPERADMIN ROUTES ==================== */}
        <Route
          path="/superadmin"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['super_admin']}>
                <DashboardLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"                    element={<SuperAdminDashboard />} />
          <Route path="advance-dashboard"            element={<SuperAdminAdvanceDashboard />} />
          <Route path="analytics-dashboard"          element={<SuperAdminAnalyticsDashboard />} />
          <Route path="admins"                       element={<AdminManagement />} />
          <Route path="dealers"                      element={<DealerManagementPage />} />
          <Route path="users"                        element={<UserManagementPage />} />
          <Route path="vehicles"                     element={<SuperAdminVehicles />} />
          <Route path="devices"                      element={<SuperAdminDevices />} />
          <Route path="technician-list"              element={<SuperAdminTechnicianList />} />
          <Route path="jobsheet"                     element={<SuperAdminJobsheet />} />
          <Route path="vehicle-detail"               element={<SuperAdminVehicleDetail />} />
          <Route path="driver-detail"                element={<SuperAdminDriverDetailPage />} />
          <Route path="geofence"                     element={<SuperAdminGeofence />} />
          <Route path="payment-detail"               element={<SuperAdminPaymentDetail />} />
          <Route path="enquiry"                      element={<SuperAdminEnquiry />} />
          <Route path="device-inventory"             element={<SuperAdminDeviceInventory />} />
          <Route path="coin-banking"                 element={<SuperAdminCoinBanking />} />
          <Route path="distance-report"              element={<SuperAdminDistanceReport />} />
          <Route path="driver-assignment-report"     element={<SuperAdminDriverAssignmentReport />} />
          <Route path="expense-report"               element={<SuperAdminExpenseReport />} />
          <Route path="geofence-report"              element={<SuperAdminGeofenceReport />} />
          <Route path="google-map-api-record"        element={<SuperAdminGoogleMapApiRecord />} />
          <Route path="idle-summary-report"          element={<SuperAdminIdleSummaryReport />} />
          <Route path="poi-report"                   element={<SuperAdminPoiReport />} />
          <Route path="register-mobile-report"       element={<SuperAdminRegisterMobileReport />} />
          <Route path="ride-report"                  element={<SuperAdminRideReport />} />
          <Route path="send-command-logs"            element={<SuperAdminSendCommandLogs />} />
          <Route path="sensor-report"                element={<SuperAdminSensorReport />} />
          <Route path="sim-tracking-report"          element={<SuperAdminSimTrackingReport />} />
          <Route path="speed-vs-distance"            element={<SuperAdminSpeedVsDistance />} />
          <Route path="status-report"                element={<SuperAdminStatusReport />} />
          <Route path="stoppage-summary-report"      element={<SuperAdminStoppageSummaryReport />} />
          <Route path="subscription-changed-report"  element={<SuperAdminSubscriptionChangedReport />} />
          <Route path="subscription-expired-report"  element={<SuperAdminSubscriptionExpiredReport />} />
          <Route path="travel-summary-report"        element={<SuperAdminTravelSummaryReport />} />
          <Route path="vehicle-log-report"           element={<SuperAdminVehicleLogReport />} />
          <Route path="add-alerts"                   element={<SuperAdminAddAlerts />} />
          <Route path="notification-list"            element={<SuperAdminNotificationList />} />
          <Route path="service-maintenance"          element={<SuperAdminServiceMaintenance />} />
          <Route path="parked-scheduler"             element={<SuperAdminParkedScheduler />} />
          <Route path="announcement"                 element={<SuperAdminAnnouncement />} />
          <Route path="settings"                     element={<SuperAdminSettings />} />
          <Route path="theme-setting"                element={<SuperAdminThemeSetting />} />
          <Route path="vehicle-config"               element={<SuperAdminVehicleConfig />} />
          <Route path="certificate"                  element={<SuperAdminCertificate />} />
          <Route path="custom-fields"                element={<SuperAdminCustomFields />} />
          <Route path="my-profile"                   element={<SuperAdminMyProfile />} />
          <Route path="raise-ticket"                 element={<SuperAdminRaiseTicket />} />
          <Route path="answer-tickets"               element={<SuperAdminAnswerTickets />} />
          <Route path="access-management"            element={<SuperAdminAccessManagement />} />
          <Route path="drivers"                      element={<DriversPage />} />
          <Route path="live-tracking"                element={<LiveTrackingPage />} />
          <Route path="playback"                     element={<PlaybackPage />} />
          <Route path="alerts"                       element={<AlertsPage />} />
          <Route path="maintenance"                  element={<MaintenancePage />} />
          <Route path="fuel"                         element={<FuelPage />} />
          <Route path="reports"                      element={<ReportsPage />} />
          <Route path="billing"                      element={<BillingPage />} />
          <Route path="plans"                        element={<PlansPage />} />
          <Route path="profile"                      element={<ProfilePage />} />
        </Route>

        {/* ==================== ADMIN ROUTES ==================== */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['admin', 'super_admin']}>
                <DashboardLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"                    element={<AdminDashboard />} />
          <Route path="advance-dashboard"            element={<AdminAdvanceDashboard />} />
          <Route path="analytics-dashboard"          element={<AdminAnalyticsDashboard />} />
          <Route path="dealers"                      element={<AdminDealerManagement />} />
          <Route path="users"                        element={<AdminUserManagement />} />
          <Route path="vehicles"                     element={<AdminVehicles />} />
          <Route path="devices"                      element={<AdminDevices />} />
          <Route path="technician-list"              element={<AdminTechnicianList />} />
          <Route path="jobsheet"                     element={<AdminJobsheet />} />
          <Route path="vehicle-detail"               element={<AdminVehicleDetail />} />
          <Route path="driver-detail"                element={<AdminDriverDetailPage />} />
          <Route path="geofence"                     element={<AdminGeofence />} />
          <Route path="payment-detail"               element={<AdminPaymentDetail />} />
          <Route path="enquiry"                      element={<AdminEnquiry />} />
          <Route path="device-inventory"             element={<AdminDeviceInventory />} />
          <Route path="coin-banking"                 element={<AdminCoinBanking />} />
          <Route path="distance-report"              element={<AdminDistanceReport />} />
          <Route path="driver-assignment-report"     element={<AdminDriverAssignmentReport />} />
          <Route path="expense-report"               element={<AdminExpenseReport />} />
          <Route path="geofence-report"              element={<AdminGeofenceReport />} />
          <Route path="google-map-api-record"        element={<AdminGoogleMapApiRecord />} />
          <Route path="idle-summary-report"          element={<AdminIdleSummaryReport />} />
          <Route path="poi-report"                   element={<AdminPoiReport />} />
          <Route path="register-mobile-report"       element={<AdminRegisterMobileReport />} />
          <Route path="ride-report"                  element={<AdminRideReport />} />
          <Route path="send-command-logs"            element={<AdminSendCommandLogs />} />
          <Route path="sensor-report"                element={<AdminSensorReport />} />
          <Route path="sim-tracking-report"          element={<AdminSimTrackingReport />} />
          <Route path="speed-vs-distance"            element={<AdminSpeedVsDistance />} />
          <Route path="status-report"                element={<AdminStatusReport />} />
          <Route path="stoppage-summary-report"      element={<AdminStoppageSummaryReport />} />
          <Route path="subscription-changed-report"  element={<AdminSubscriptionChangedReport />} />
          <Route path="subscription-expired-report"  element={<AdminSubscriptionExpiredReport />} />
          <Route path="travel-summary-report"        element={<AdminTravelSummaryReport />} />
          <Route path="vehicle-log-report"           element={<AdminVehicleLogReport />} />
          <Route path="add-alerts"                   element={<AdminAddAlerts />} />
          <Route path="notification-list"            element={<AdminNotificationList />} />
          <Route path="service-maintenance"          element={<AdminServiceMaintenance />} />
          <Route path="parked-scheduler"             element={<AdminParkedScheduler />} />
          <Route path="announcement"                 element={<AdminAnnouncement />} />
          <Route path="settings"                     element={<AdminSettings />} />
          <Route path="theme-setting"                element={<AdminThemeSetting />} />
          <Route path="vehicle-config"               element={<AdminVehicleConfig />} />
          <Route path="certificate"                  element={<AdminCertificate />} />
          <Route path="custom-fields"                element={<AdminCustomFields />} />
          <Route path="raise-ticket"                 element={<AdminRaiseTicket />} />
          <Route path="answer-tickets"               element={<AdminAnswerTickets />} />
          <Route path="access-management"            element={<AdminAccessManagement />} />
          <Route path="drivers"                      element={<DriversPage />} />
          <Route path="live-tracking"                element={<LiveTrackingPage />} />
          <Route path="playback"                     element={<PlaybackPage />} />
          <Route path="alerts"                       element={<AlertsPage />} />
          <Route path="reports"                      element={<ReportsPage />} />
          <Route path="profile"                      element={<ProfilePage />} />
        </Route>

        {/* ==================== DEALER ROUTES ==================== */}
        <Route
          path="/dealer"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['dealer', 'admin', 'super_admin']}>
                <DashboardLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"                    element={<DealerDashboard />} />
          <Route path="advance-dashboard"            element={<DealerAdvanceDashboard />} />
          <Route path="analytics-dashboard"          element={<DealerAnalyticsDashboard />} />
          <Route path="users"                        element={<DealerUserManagement />} />
          <Route path="vehicles"                     element={<DealerVehicles />} />
          <Route path="devices"                      element={<DealerDevices />} />
          <Route path="technician-list"              element={<DealerTechnicianList />} />
          <Route path="jobsheet"                     element={<DealerJobsheet />} />
          <Route path="vehicle-detail"               element={<DealerVehicleDetail />} />
          <Route path="driver-detail"                element={<DealerDriverDetailPage />} />
          <Route path="geofence"                     element={<DealerGeofence />} />
          <Route path="payment-detail"               element={<DealerPaymentDetail />} />
          <Route path="enquiry"                      element={<DealerEnquiry />} />
          <Route path="device-inventory"             element={<DealerDeviceInventory />} />
          <Route path="coin-banking"                 element={<DealerCoinBanking />} />
          <Route path="distance-report"              element={<DealerDistanceReport />} />
          <Route path="driver-assignment-report"     element={<DealerDriverAssignmentReport />} />
          <Route path="expense-report"               element={<DealerExpenseReport />} />
          <Route path="geofence-report"              element={<DealerGeofenceReport />} />
          <Route path="google-map-api-record"        element={<DealerGoogleMapApiRecord />} />
          <Route path="idle-summary-report"          element={<DealerIdleSummaryReport />} />
          <Route path="poi-report"                   element={<DealerPoiReport />} />
          <Route path="register-mobile-report"       element={<DealerRegisterMobileReport />} />
          <Route path="ride-report"                  element={<DealerRideReport />} />
          <Route path="send-command-logs"            element={<DealerSendCommandLogs />} />
          <Route path="sensor-report"                element={<DealerSensorReport />} />
          <Route path="sim-tracking-report"          element={<DealerSimTrackingReport />} />
          <Route path="speed-vs-distance"            element={<DealerSpeedVsDistance />} />
          <Route path="status-report"                element={<DealerStatusReport />} />
          <Route path="stoppage-summary-report"      element={<DealerStoppageSummaryReport />} />
          <Route path="subscription-changed-report"  element={<DealerSubscriptionChangedReport />} />
          <Route path="subscription-expired-report"  element={<DealerSubscriptionExpiredReport />} />
          <Route path="travel-summary-report"        element={<DealerTravelSummaryReport />} />
          <Route path="vehicle-log-report"           element={<DealerVehicleLogReport />} />
          <Route path="add-alerts"                   element={<DealerAddAlerts />} />
          <Route path="notification-list"            element={<DealerNotificationList />} />
          <Route path="service-maintenance"          element={<DealerServiceMaintenance />} />
          <Route path="parked-scheduler"             element={<DealerParkedScheduler />} />
          <Route path="announcement"                 element={<DealerAnnouncement />} />
          <Route path="settings"                     element={<DealerSettings />} />
          <Route path="theme-setting"                element={<DealerThemeSetting />} />
          <Route path="vehicle-config"               element={<DealerVehicleConfig />} />
          <Route path="certificate"                  element={<DealerCertificate />} />
          <Route path="custom-fields"                element={<DealerCustomFields />} />
          <Route path="raise-ticket"                 element={<DealerRaiseTicket />} />
          <Route path="answer-tickets"               element={<DealerAnswerTickets />} />
          <Route path="access-management"            element={<DealerAccessManagement />} />
          <Route path="drivers"                      element={<DriversPage />} />
          <Route path="live-tracking"                element={<LiveTrackingPage />} />
          <Route path="playback"                     element={<PlaybackPage />} />
          <Route path="alerts"                       element={<AlertsPage />} />
          <Route path="reports"                      element={<ReportsPage />} />
          <Route path="profile"                      element={<ProfilePage />} />
        </Route>

        {/* ==================== ENDUSER ROUTES ==================== */}
        <Route
          path="/user"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['user', 'dealer', 'admin', 'super_admin']}>
                <DashboardLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"                    element={<EndUserDashboard />} />
          <Route path="advance-dashboard"            element={<EndUserAdvanceDashboard />} />
          <Route path="analytics-dashboard"          element={<EndUserAnalyticsDashboard />} />
          <Route path="vehicles"                     element={<EndUserVehicles />} />
          <Route path="vehicle-detail"               element={<EndUserVehicleDetail />} />
          <Route path="driver-detail"                element={<EndUserDriverDetailPage />} />
          <Route path="distance-report"              element={<EndUserDistanceReport />} />
          <Route path="driver-assignment-report"     element={<EndUserDriverAssignmentReport />} />
          <Route path="expense-report"               element={<EndUserExpenseReport />} />
          <Route path="idle-summary-report"          element={<EndUserIdleSummaryReport />} />
          <Route path="ride-report"                  element={<EndUserRideReport />} />
          <Route path="sensor-report"                element={<EndUserSensorReport />} />
          <Route path="speed-vs-distance"            element={<EndUserSpeedVsDistance />} />
          <Route path="status-report"                element={<EndUserStatusReport />} />
          <Route path="stoppage-summary-report"      element={<EndUserStoppageSummaryReport />} />
          <Route path="travel-summary-report"        element={<EndUserTravelSummaryReport />} />
          <Route path="notification-list"            element={<EndUserNotificationList />} />
          <Route path="service-maintenance"          element={<EndUserServiceMaintenance />} />
          <Route path="settings"                     element={<EndUserSettings />} />
          <Route path="theme-setting"                element={<EndUserThemeSetting />} />
          <Route path="my-profile"                   element={<EndUserMyProfile />} />
          <Route path="raise-ticket"                 element={<EndUserRaiseTicket />} />
          <Route path="live-tracking"                element={<LiveTrackingPage />} />
          <Route path="playback"                     element={<PlaybackPage />} />
          <Route path="alerts"                       element={<AlertsPage />} />
          <Route path="reports"                      element={<ReportsPage />} />
          <Route path="profile"                      element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AuthProvider>
      <ToastProvider>
        <ThemedApp />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;