import React from 'react';
import { IconCheck, IconReceipt, IconClock, IconStore } from './Icons';

export function OrderConfirmationModal({
  order,
  canteenName,
  onClose,
  onViewOrderDetails
}) {
  if (!order) return null;

  return (
    <div className="modal-backdrop">
      <div
        className="modal-dialog modal-dialog-md confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-heading"
      >
        {/* Success Icon */}
        <div className="success-icon-banner">
          <div className="success-circle">
            <IconCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 id="confirmation-heading" className="confirmation-heading">Pre-order Confirmed!</h3>
          <p className="confirmation-sub">Your order was received and sent to the kitchen.</p>
        </div>

        {/* Big Daily Token Card */}
        <div className="daily-token-card">
          <span className="token-label">YOUR COLLECTION TOKEN</span>
          <div className="token-number-hero">
            {order.daily_token}
          </div>
          <p className="token-instruction">
            📢 Show this token at <strong>{canteenName}</strong> when picking up your food.
          </p>
        </div>

        {/* Order Details Mini Receipt */}
        <div className="confirmation-details-box">
          <div className="confirm-row">
            <span className="confirm-label"><IconStore className="w-4 h-4 inline mr-1" /> Canteen</span>
            <span className="confirm-val">{canteenName}</span>
          </div>
          <div className="confirm-row">
            <span className="confirm-label"><IconClock className="w-4 h-4 inline mr-1" /> Order Status</span>
            <span className={`status-pill ${
              order.status === 'READY' ? 'status-pill-ready' :
              order.status === 'PREPARING' ? 'status-pill-preparing' :
              order.status === 'COLLECTED' ? 'status-pill-collected' :
              order.status === 'CANCELLED' ? 'status-pill-cancelled' :
              'status-pill-pending'
            }`}>{order.status}</span>
          </div>
          {order.customer_name && (
            <div className="confirm-row">
              <span className="confirm-label">Student Name</span>
              <span className="confirm-val">{order.customer_name}</span>
            </div>
          )}
          <div className="confirm-row">
            <span className="confirm-label">Total Amount</span>
            <span className="confirm-val font-bold">₹{Math.round(order.total_amount)} ({order.payment_status})</span>
          </div>
        </div>

        {/* Itemized summary */}
        {order.items && order.items.length > 0 && (
          <div className="order-items-snippet">
            <span className="snippet-title">Items Ordered:</span>
            <div className="snippet-list">
              {order.items.map((item) => (
                <div key={item.id} className="snippet-item">
                  <span>{item.quantity} × {item.item_name}</span>
                  <span>₹{Math.round(item.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions-stacked mt-4">
          <button
            onClick={() => onViewOrderDetails(order)}
            className="btn-primary"
          >
            <IconReceipt className="w-4 h-4 mr-2" />
            Track Live Order Status
          </button>
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
