import React from 'react';
import {
  IconStore,
  IconSun,
  IconMoon,
  IconRefresh,
  IconChefHat,
  IconBoxes,
  IconLock,
  IconLogout
} from './Icons';

export function OwnerHeader({
  canteens,
  selectedCanteenId,
  onSelectCanteenId,
  theme,
  onToggleTheme,
  onRefreshOrders,
  isRefreshing,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  onOpenStockModal,
  systemInfo,
  isWsConnected = false,
  authUser = null,
  onLogout = null,
  assignedCanteenName = null,
  onSwitchToStudent = null
}) {
  const isDark = theme === 'dark';

  return (
    <header className="header-root">
      <div className="header-container">
        {/* Left: Branding & Role */}
        <div className="brand-group">
          <div className="brand-logo" aria-hidden="true">
            <IconChefHat size={24} className="logo-chef-icon" />
          </div>
          <div>
            <div className="brand-title-wrap">
              <h1 className="brand-name">UniHub</h1>
              <span className="brand-badge">Kitchen & Staff Portal</span>
            </div>
            <p className="brand-sub">
              Live Order Management & Token Pickup Verification
              {systemInfo?.today_token_letter && (
                <span className="token-cycle-indicator">
                  · Today's Cycle: <strong>{systemInfo.today_token_letter}</strong>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Center: Canteen Outlet (Scoped strictly to authorized canteen) */}
        <div className="canteen-selector-wrap canteen-locked-wrap">
          <div className="canteen-assigned-pill" title={`Authorized Kitchen: ${assignedCanteenName || 'Designated Canteen'}`}>
            <IconStore size={16} className="text-accent flex-shrink-0" />
            <div className="canteen-pill-text-wrap">
              <span className="canteen-pill-label">Authorized Kitchen:</span>
              <span className="canteen-assigned-name">{assignedCanteenName || 'Designated Canteen'}</span>
            </div>
            <span className="canteen-locked-badge">
              <IconLock size={12} className="inline mr-1" />
              Assigned
            </span>
          </div>
        </div>

        {/* Right: Actions (Stock Manager, Auto-Refresh, Manual Refresh, Theme Toggle) */}
        <div className="header-actions">
          {/* Quick Stock Manager Modal Trigger */}
          <button
            type="button"
            onClick={onOpenStockModal}
            className="action-btn stock-btn"
            title="Manage Canteen Menu & Inventory Stock"
          >
            <IconBoxes size={18} className="action-btn-icon" />
            <span className="btn-label">Menu & Stock</span>
          </button>

          {/* Live Sync / WebSocket Indicator */}
          <button
            type="button"
            onClick={onToggleAutoRefresh}
            className={`action-btn auto-refresh-btn ${isWsConnected ? 'auto-refresh-active' : autoRefreshEnabled ? 'auto-refresh-rest' : ''}`}
            title={
              isWsConnected
                ? 'WebSocket connected: Receiving instant live order updates.'
                : autoRefreshEnabled
                ? 'REST Polling active (15s). Click to pause.'
                : 'Auto-refresh paused. Click to resume.'
            }
          >
            <span className={`live-dot ${isWsConnected || autoRefreshEnabled ? 'live-dot-pulse' : ''}`} />
            <span className="btn-label">
              {isWsConnected ? 'Live (WS)' : autoRefreshEnabled ? 'Polling (15s)' : 'Sync: Off'}
            </span>
          </button>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={onRefreshOrders}
            disabled={isRefreshing}
            className="action-btn refresh-btn"
            title="Refresh Orders Now"
          >
            <IconRefresh
              size={18}
              className={`action-btn-icon ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span className="btn-label">Refresh</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="action-btn theme-toggle-btn"
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          >
            {isDark ? (
              <IconSun size={18} className="theme-toggle-icon theme-sun" />
            ) : (
              <IconMoon size={18} className="theme-toggle-icon theme-moon" />
            )}
            <span className="theme-toggle-label">{isDark ? 'Light' : 'Dark'}</span>
          </button>

          {/* Switch to Student View */}
          {onSwitchToStudent && (
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="action-btn student-switch-btn"
              title="Return to Student Ordering View"
            >
              <IconStore size={18} className="action-btn-icon" />
              <span className="btn-label">Student View</span>
            </button>
          )}

          {/* User info & Logout */}
          {authUser && (
            <div className="owner-user-tag" title={`Logged in as ${authUser.username}`}>
              <span className="owner-user-text">@{authUser.username}</span>
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="action-btn logout-btn"
              title="Sign Out of Kitchen Portal"
            >
              <IconLogout size={16} className="action-btn-icon" />
              <span className="btn-label">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
