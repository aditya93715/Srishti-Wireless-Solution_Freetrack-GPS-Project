// src/components/DashboardLayout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ChatWidget from './ChatWidget';

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

const DashboardLayout = () => {
  const windowWidth      = useWindowWidth();
  const isDesktop        = windowWidth >= 1280;
  const isLaptop         = windowWidth >= 1024 && windowWidth < 1280;
  const isMobileOrTablet = windowWidth < 1024;

  // Desktop  → start open (expanded)
  // Laptop   → start closed (icon-only), toggle opens it
  // Mobile/Tablet → start closed (off-screen), toggle slides it in
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);

  // Re-initialise when crossing breakpoints
  useEffect(() => {
    if (isDesktop)        setSidebarOpen(true);
    if (isLaptop)         setSidebarOpen(false);
    if (isMobileOrTablet) setSidebarOpen(false);
  }, [isDesktop, isLaptop, isMobileOrTablet]);

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const closeSidebar  = () => setSidebarOpen(false);

  return (
    <div style={{
      display:  'flex',
      width:    '100vw',
      height:   '100vh',
      overflow: 'hidden',
      margin:   0,
      padding:  0,
    }}>

      {/* Sidebar — handles its own overlay backdrop internally on mobile/tablet */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        onClose={closeSidebar}
      />

      {/* Right column — fills remaining width */}
      <div style={{
        flex:          '1 1 0',
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        minWidth:      0,
        background:    'var(--theme-gradient-alpha, var(--theme-color-alpha-10, #f5f6fa))',
        transition:    'background 0.4s ease',
      }}>

        {/* Topbar — full width, flush top */}
        <Topbar onMenuToggle={toggleSidebar} />

        {/* Main scrollable content area */}
        <main style={{
          flex:       '1 1 0',
          overflowY:  'auto',
          overflowX:  'hidden',
          padding:    0,
          background: 'var(--bg-base, #f5f6fa)',
          transition: 'background 0.4s ease',
        }}>
          <Outlet />
        </main>

      </div>

      {/* Floating support chat — common to every role, mounted once here */}
      <ChatWidget />

    </div>
  );
};

export default DashboardLayout;