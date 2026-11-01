import React from 'react';
import { IconX, IconShoppingBag, IconPlus, IconMinus, IconArrowRight, IconVeg, IconNonVeg } from './Icons';

export function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  canteen,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout
}) {
  if (!isOpen) return null;

  const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const gstPercent = canteen?.gst_percent || 0;
  const gstAmount = gstPercent > 0 ? (subtotal * gstPercent) / 100 : 0;
  const grandTotal = subtotal + gstAmount;

  const hasInvalidItems = cartItems.some(
    (item) => !item.is_available || item.stock_quantity <= 0 || item.quantity > item.stock_quantity
  );

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your Tray"
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-wrap">
            <IconShoppingBag className="w-5 h-5 text-orange-600" />
            <div>
              <h3 className="drawer-title">Your Tray</h3>
              {canteen && (
                <p className="drawer-canteen-name">Ordering from: <strong>{canteen.name}</strong></p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="drawer-close-btn"
            title="Close cart"
            aria-label="Close tray"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Cart Items List */}
        <div className="drawer-body">
          {cartItems.length === 0 ? (
            <div className="empty-cart-state">
              <span className="empty-cart-icon">🛒</span>
              <h4>Your tray is empty</h4>
              <p>Explore the menu and add your favorite dishes to pre-order without waiting!</p>
              <button onClick={onClose} className="btn-browse-menu">
                Browse Menu
              </button>
            </div>
          ) : (
            <div className="cart-items-list">
              {cartItems.map((item) => {
                const isItemSoldOut = !item.is_available || item.stock_quantity <= 0;
                const isOverStock = item.quantity > item.stock_quantity;

                return (
                  <div key={item.id} className={`cart-item-row ${isItemSoldOut ? 'opacity-70 bg-red-50/30' : ''}`}>
                    <div className="cart-item-info">
                      <div className="cart-item-title-row">
                        {item.dietary_label === 'veg' && <IconVeg className="w-3.5 h-3.5 mr-1" />}
                        {item.dietary_label === 'non-veg' && <IconNonVeg className="w-3.5 h-3.5 mr-1" />}
                        <span className="cart-item-name">{item.name}</span>
                        {isItemSoldOut ? (
                          <span className="text-xs font-bold text-red-500 ml-1.5">(Sold Out)</span>
                        ) : isOverStock ? (
                          <span className="text-xs font-bold text-amber-600 ml-1.5">(Only {item.stock_quantity} left)</span>
                        ) : null}
                      </div>
                      <span className="cart-item-unit-price">₹{Math.round(item.price)} each</span>
                    </div>

                    {/* Quantity Stepper */}
                    <div className="cart-item-actions">
                      <div className="qty-stepper qty-stepper-sm">
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          className="stepper-btn"
                          title="Reduce quantity"
                          aria-label={`Reduce quantity of ${item.name}`}
                        >
                          <IconMinus className="w-3 h-3" />
                        </button>
                        <span className="stepper-count">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          className="stepper-btn"
                          title="Increase quantity"
                          aria-label={`Increase quantity of ${item.name}`}
                          disabled={isItemSoldOut || item.quantity >= item.stock_quantity}
                        >
                          <IconPlus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="cart-item-subtotal">
                        ₹{Math.round(item.price * item.quantity)}
                      </span>

                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className="cart-remove-btn"
                        title="Remove item"
                        aria-label={`Remove ${item.name} from tray`}
                      >
                        <IconX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer (Summary & Checkout CTA) */}
        {cartItems.length > 0 && (
          <div className="drawer-footer">
            <div className="bill-summary">
              <div className="bill-row">
                <span>Items Subtotal</span>
                <span>₹{Math.round(subtotal)}</span>
              </div>
              {gstPercent > 0 && (
                <div className="bill-row bill-gst-row">
                  <span>GST ({gstPercent}%)</span>
                  <span>+₹{Math.round(gstAmount)}</span>
                </div>
              )}
              <div className="bill-row bill-total-row">
                <span>To Pay</span>
                <span>₹{Math.round(grandTotal)}</span>
              </div>
            </div>

            <button
              onClick={onProceedToCheckout}
              disabled={hasInvalidItems}
              className="btn-checkout"
              title={hasInvalidItems ? 'Remove or adjust sold-out items to proceed' : 'Proceed to Checkout'}
            >
              <span>Proceed to Checkout</span>
              <IconArrowRight className="w-4 h-4 ml-2" />
            </button>
            {hasInvalidItems && (
              <p className="text-xs text-red-500 text-center mt-2 font-medium">
                ⚠️ Some items in your tray are sold out or exceed available stock. Please adjust your tray.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
