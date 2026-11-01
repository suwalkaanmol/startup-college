import React, { useState } from 'react';
import {
  IconChefHat,
  IconLock,
  IconUser,
  IconSun,
  IconMoon,
  IconAlertCircle
} from './Icons';
import { loginOwner } from '../api';

export function OwnerLogin({ onLoginSuccess, theme, onToggleTheme, sessionExpiredNotice = false, onSwitchToStudent = null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(sessionExpiredNotice ? 'Your session has expired. Please log in again.' : null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await loginOwner(username.trim(), password);
      if (res && res.owner) {
        onLoginSuccess(res.owner);
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className="login-page-root">
      {/* Top bar with back to hub, switch view, and theme toggle */}
      <div className="login-theme-bar flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <a href="../index.html" className="hub-back-btn text-xs text-gray-500 hover:text-orange-600 underline">
            ← Back to Campus Hub
          </a>
          {onSwitchToStudent && (
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="switch-view-btn text-xs text-gray-500 hover:text-orange-600 underline"
            >
              🍽️ Student View
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="theme-toggle-btn"
          title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        >
          {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
          <span className="theme-toggle-text">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      <div className="login-card">
        {/* Branding */}
        <div className="login-header">
          <div className="login-logo-wrap">
            <IconChefHat size={32} className="login-chef-icon" />
          </div>
          <h1 className="login-title">UniHub Canteen</h1>
          <p className="login-subtitle">Kitchen & Staff Portal</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-error-alert" role="alert">
            <IconAlertCircle size={18} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-username" className="form-label">
              <IconUser size={15} className="mr-1 inline text-muted" />
              Username
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              required
              disabled={loading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. kc_owner"
              className="form-input login-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">
              <IconLock size={15} className="mr-1 inline text-muted" />
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your kitchen password"
              className="form-input login-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary login-submit-btn"
          >
            {loading ? (
              <span className="btn-loading-content">
                <span className="spinner-icon mr-2">⏳</span>
                Verifying credentials...
              </span>
            ) : (
              'Sign In to Kitchen Portal'
            )}
          </button>
        </form>

        {/* Canteen Outlets Info Footer */}
        <div className="login-footer-info">
          <p className="login-info-heading">Authorized Outlet Logins</p>
          <div className="login-outlets-grid">
            <span className="login-outlet-pill">Darling Food Court</span>
            <span className="login-outlet-pill">KC Foods VIT</span>
            <span className="login-outlet-pill">Garnish</span>
            <span className="login-outlet-pill">Hangy &amp; Swig</span>
          </div>
          <p className="login-help-text">
            Each outlet manager account is restricted exclusively to its designated canteen.
          </p>
        </div>
      </div>
    </div>
  );
}
