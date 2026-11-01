import React, { useState } from 'react';
import {
  IconClock,
  IconUser,
  IconPhone,
  IconCheck,
  IconCheckCircle,
  IconChefHat,
  IconPackage,
  IconReceipt,
  IconBan,
  IconArrowRight
} from './Icons';
import { formatTimeIST, formatDateIST } from '../date';

export function OrderCard({
  order,
  canteenMap = {},
  onUpdateStatus,
  onViewDetails,
  isUpdating
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canteenName = canteenMap[order.canteen_id]?.name || `Canteen #${order.canteen_id}`;

  const handleStatusClick = (nextStatus) => {
    onUpdateStatus(order.id, nextStatus);
  };

  const handleCancelClick = () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setConfirmCancel(false);
    onUpdateStatus(order.id, 'CANCELLED');
  };

  return (
    <div className={`order-card order-card-${order.status.toLowerCase()}`}>
      {/* Top Banner: Daily Token & Status */}
      <div className="order-card-header">
        <div className="token-group">
          <span className="order-token-badge">{order.daily_token}</span>
          <div className="order-id-meta">
            <span className="order-id-tag">Order #{order.id}</span>
            <span className="order-time-tag">
              <IconClock size={12} className="inline mr-1" />
              {formatTimeIST(order.created_at)} · {formatDateIST(order.created_at, order.token_date)}
            </span>
          </div>
        </div>

        <span className={`status-badge status-badge-${order.status.toLowerCase()}`}>
          {order.status}
        </span>
      </div>

      {/* Outlet & Customer Details */}
      <div className="order-card-body">
        <div className="order-canteen-tag">
          📍 {canteenName}
        </div>

        <div className="customer-info-strip">
          <div className="customer-info-item">
            <IconUser size={14} className="text-muted inline mr-1" />
            <strong className="customer-name">{order.customer_name}</strong>
          </div>
          <div className="customer-info-item">
            <IconPhone size={14} className="text-muted inline mr-1" />
            <a href={`tel:${order.customer_phone}`} className="customer-phone-link">
              {order.customer_phone}
            </a>
          </div>
        </div>

        {/* Itemized Order List */}
        <div className="order-items-container">
          <div className="items-list-header">
            <span>Dishes Ordered</span>
            <span>Subtotal</span>
          </div>
          <ul className="order-items-list">
            {order.items && order.items.map((item) => (
              <li key={item.id} className="order-item-row">
                <div className="item-name-group">
                  <span className="item-qty-tag">{item.quantity}×</span>
                  <span className="item-title">{item.item_name}</span>
                </div>
                <span className="item-price-val">₹{Math.round(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Total & Payment Summary */}
        <div className="order-financials-row">
          <div className="payment-status-block">
            <span className="payment-label">Payment:</span>
            <span className={`payment-pill payment-pill-${order.payment_status.toLowerCase()}`}>
              {order.payment_status === 'PAID' ? '✓ PAID' : order.payment_status}
            </span>
          </div>
          <div className="order-total-block">
            <span className="total-label">Total Amount</span>
            <strong className="total-amount-val">₹{Math.round(order.total_amount)}</strong>
          </div>
        </div>
      </div>

      {/* Actions Section */}
      <div className="order-card-footer">
        {isUpdating ? (
          <div className="updating-indicator">
            <span className="spinner" />
            <span>Updating Order #{order.id}...</span>
          </div>
        ) : (
          <div className="actions-wrapper">
            {/* Quick Progression Actions */}
            {order.status === 'PENDING' && (
              <div className="action-button-row">
                <button
                  type="button"
                  onClick={() => handleStatusClick('PREPARING')}
                  className="btn-status-action btn-start-prep"
                  title="Move to Kitchen / Preparing"
                >
                  <IconChefHat size={16} />
                  <span>Start Preparing</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelClick}
                  className={`btn-status-cancel ${confirmCancel ? 'btn-confirm-cancel' : ''}`}
                  title="Cancel order and restore inventory"
                >
                  <IconBan size={14} />
                  <span>{confirmCancel ? 'Confirm Cancel?' : 'Cancel'}</span>
                </button>
              </div>
            )}

            {order.status === 'PREPARING' && (
              <div className="action-button-row">
                <button
                  type="button"
                  onClick={() => handleStatusClick('READY')}
                  className="btn-status-action btn-mark-ready"
                  title="Notify ready for pickup"
                >
                  <IconCheckCircle size={16} />
                  <span>Mark Ready for Pickup</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelClick}
                  className={`btn-status-cancel ${confirmCancel ? 'btn-confirm-cancel' : ''}`}
                  title="Cancel order and restore inventory"
                >
                  <IconBan size={14} />
                  <span>{confirmCancel ? 'Confirm?' : 'Cancel'}</span>
                </button>
              </div>
            )}

            {order.status === 'READY' && (
              <div className="action-button-row">
                <button
                  type="button"
                  onClick={() => handleStatusClick('COLLECTED')}
                  className="btn-status-action btn-mark-collected"
                  title="Mark as handed over to student"
                >
                  <IconCheck size={16} />
                  <span>Mark Collected & Paid</span>
                </button>
              </div>
            )}

            {order.status === 'COLLECTED' && (
              <div className="completed-state-banner">
                <IconCheckCircle size={16} className="text-emerald-500" />
                <span>Collected & Settled</span>
              </div>
            )}

            {order.status === 'CANCELLED' && (
              <div className="cancelled-state-banner">
                <IconBan size={16} className="text-red-500" />
                <span>Cancelled (Stock Restored)</span>
              </div>
            )}

            {/* View Full Details Button */}
            <button
              type="button"
              onClick={() => onViewDetails(order)}
              className="btn-details-link"
              title="Inspect order details and timeline"
            >
              <span>Details</span>
              <IconArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
