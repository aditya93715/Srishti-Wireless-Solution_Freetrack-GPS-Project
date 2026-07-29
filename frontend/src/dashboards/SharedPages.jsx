// Shared placeholder pages for features that connect to GPS data
import React from 'react';
import PlaceholderPage from '../components/PlaceholderPage';

export const LiveTrackingPage = () => (
  <PlaceholderPage
    title="Live Tracking"
    icon="tracking"
    accent="var(--accent-cyan)"
    description="Real-time GPS tracking map. Connect to the GPS_Tracking MongoDB collection to display live vehicle positions."
  />
);

export const PlaybackPage = () => (
  <PlaceholderPage
    title="Playback"
    icon="playback"
    accent="var(--accent-blue)"
    description="Route replay and historical path visualization. Requires GPS history data from the tracking database."
  />
);

export const GeofencePage = () => (
  <PlaceholderPage
    title="Geofence"
    icon="geofence"
    accent="var(--accent-purple)"
    description="Define and manage geofence zones. Trigger alerts when vehicles enter or exit defined boundaries."
  />
);

export const AlertsPage = () => (
  <PlaceholderPage
    title="Alerts"
    icon="alert"
    accent="var(--accent-red)"
    description="Vehicle alerts, speeding notifications, geofence breaches, and maintenance reminders."
  />
);

export const ReportsPage = () => (
  <PlaceholderPage
    title="Reports"
    icon="reports"
    accent="var(--accent-blue)"
    description="Trip reports, mileage summaries, fuel consumption, and fleet performance analytics."
  />
);

export const VehiclesPage = () => (
  <PlaceholderPage
    title="Vehicles"
    icon="vehicle"
    accent="var(--accent-amber)"
    description="All registered vehicles with IMEI mapping, status, and assignment to users."
  />
);

export const DevicesPage = () => (
  <PlaceholderPage
    title="Devices"
    icon="device"
    accent="var(--accent-green)"
    description="GPS device inventory, IMEI management, SIM assignment, and device health monitoring."
  />
);

export const DriversPage = () => (
  <PlaceholderPage
    title="Drivers"
    icon="drivers"
    accent="var(--accent-cyan)"
    description="Driver profiles, license tracking, assignment to vehicles, and behaviour scoring."
  />
);

export const MaintenancePage = () => (
  <PlaceholderPage
    title="Maintenance"
    icon="maintenance"
    accent="var(--accent-amber)"
    description="Scheduled maintenance, service reminders, and vehicle health tracking."
  />
);

export const FuelPage = () => (
  <PlaceholderPage
    title="Fuel Monitoring"
    icon="fuel"
    accent="var(--accent-green)"
    description="Fuel consumption tracking, refuel events, and efficiency reports per vehicle."
  />
);

export const BillingPage = () => (
  <PlaceholderPage
    title="Billing"
    icon="billing"
    accent="var(--accent-blue)"
    description="Invoice management, payment history, and account billing for the platform."
  />
);

export const PlansPage = () => (
  <PlaceholderPage
    title="Subscription Plans"
    icon="plans"
    accent="var(--accent-purple)"
    description="Manage subscription tiers, feature bundles, and assign plans to admin accounts."
  />
);

export const SettingsPage = () => (
  <PlaceholderPage
    title="System Settings"
    icon="settings"
    accent="var(--text-muted)"
    description="Platform-wide configuration, API keys, email settings, and system preferences."
  />
);
