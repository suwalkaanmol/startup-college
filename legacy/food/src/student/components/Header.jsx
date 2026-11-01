import React from 'react';
import { IconShoppingBag, IconReceipt, IconStore, IconSun, IconMoon } from './Icons';

export function Header({
  activeCanteen,
  cartItemCount,
  cartTotal,
  onOpenCart,
  onOpenMyOrders,
  myOrdersCount,
  onSwitchCanteenClick,
  theme = 'light',
  onToggleTheme,
  onOpenStaffLogin
}) {
  const isDark = theme === 'dark';

  return (
    <header className="header-root">
      <div className="header-container">
        {/* Left: Brand Logo & Title */}
        <div className="brand-group">
          <div className="brand-logo" aria-hidden="true">
            <span className="logo-icon">🍽️</span>
          </div>
          <div>
            <div className="brand-title-wrap">
              <h1 className="brand-name">UniHub</h1>
              <span className="brand-badge">Student Pre-order</span>
            </div>
            <p className="brand-sub">Zero-queue campus dining</p>
          </div>
        </div>

        {/* Center: Selected Canteen Pill */}
        {activeCanteen && (
          <button
            type="button"
            onClick={onSwitchCanteenClick}
            className="canteen-pill-btn"
            title="Click to view or switch canteens"
          >
            <IconStore size={16} className="canteen-pill-icon" />
            <div className="canteen-pill-text">
              <span className="canteen-pill-name">{activeCanteen.name}</span>
              <span className="canteen-pill-loc">{activeCanteen.location}</span>
            </div>
            <span className="pill-switch-tag">Switch</span>
          </button>
        )}

        {/* Right: Actions (Theme Toggle, My Orders & Cart) */}
        <div className="header-actions">
          {/* Light / Dark Mode Toggle */}
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

          {/* My Orders Button */}
          <button
            type="button"
            onClick={onOpenMyOrders}
            className="action-btn my-orders-btn"
            title="View my orders and active tokens"
          >
            <IconReceipt size={18} className="action-btn-icon" />
            <span className="btn-label">My Orders</span>
            {myOrdersCount > 0 && (
              <span className="counter-badge orders-counter">{myOrdersCount}</span>
            )}
          </button>

          {/* Cart Button */}
          <button
            type="button"
            onClick={onOpenCart}
            className="action-btn cart-btn"
            title="View your shopping cart"
          >
            <IconShoppingBag size={18} className="action-btn-icon" />
            <span className="btn-label">Cart</span>
            {cartItemCount > 0 ? (
              <span className="counter-badge cart-counter">
                {cartItemCount} · ₹{Math.round(cartTotal)}
              </span>
            ) : (
              <span className="cart-empty-tag">0</span>
            )}
          </button>

          {/* Canteen Staff Login (Discreet) */}
          {onOpenStaffLogin && (
            <button
              type="button"
              onClick={onOpenStaffLogin}
              className="action-btn staff-portal-btn"
              title="Canteen Staff Login"
              aria-label="Canteen Staff Login"
            >
              <IconStore size={18} className="action-btn-icon" />
              <span className="btn-label">Staff Login</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
