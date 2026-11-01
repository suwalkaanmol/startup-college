import React from 'react';
import { IconShoppingBag } from './Icons';

export function MobileCartBar({
  itemCount,
  totalAmount,
  onOpenCart
}) {
  if (itemCount <= 0) return null;

  return (
    <aside className="mobile-cart-bar-root" aria-label="Shopping Cart Bar">
      <div className="mobile-cart-bar-content">
        <div className="mobile-cart-meta">
          <span className="mobile-cart-count">
            <IconShoppingBag size={16} className="inline mr-1" />
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <strong className="mobile-cart-price">₹{Math.round(totalAmount)}</strong>
        </div>

        <button
          type="button"
          onClick={onOpenCart}
          className="mobile-cart-action-btn"
          title="Open cart and proceed to checkout"
        >
          <span>View Cart</span>
          <span className="mobile-cart-arrow">→</span>
        </button>
      </div>
    </aside>
  );
}
