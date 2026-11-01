import React, { useState } from 'react';
import { IconX, IconRefresh, IconReceipt, IconCheck } from './Icons';
import { formatDetailsTimestampIST } from '../date';

export function OrderDetailsModal({
  order,
  canteenName,
  isOpen,
  onClose,
  onRefresh,
  onCancelOrder
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  if (!isOpen || !order) return null;

  const status = order.status?.toUpperCase();

  // Progress steps
  const steps = [
    { key: 'PENDING', label: 'Order Placed' },
    { key: 'PREPARING', label: 'Preparing' },
    { key: 'READY', label: 'Ready for Pickup' },
    { key: 'COLLECTED', label: 'Collected' },
  ];

  const getStepIndex = (st) => {
    switch (st) {
      case 'PENDING': return 0;
      case 'PREPARING': return 1;
      case 'READY': return 2;
      case 'COLLECTED': return 3;
      case 'CANCELLED': return -1;
      default: return 0;
    }
  };

  const currentStep = getStepIndex(status);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh(order.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this order?')) {
      return;
    }
    setIsCancelling(true);
    try {
      if (onCancelOrder) {
        await onCancelOrder(order.id);
      }
    } catch (err) {
      // Handled in parent
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-dialog-md" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <IconReceipt className="w-5 h-5 text-orange-600" />
            <div>
              <h3 className="modal-title">Order #{order.id} Details</h3>
              <p className="modal-sub">{formatDetailsTimestampIST(order.created_at, order.token_date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn" title="Close details">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Hero Token Card */}
        <div className="token-hero-banner">
          <div className="flex justify-between items-center">
            <div>
              <span className="token-hero-sub">PICKUP TOKEN</span>
              <div className="token-hero-num">{order.daily_token}</div>
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="refresh-status-btn"
              title="Check live status from kitchen"
            >
              <IconRefresh className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Checking...' : 'Refresh Status'}</span>
            </button>
          </div>

          {/* Alert Callout based on status */}
          <div className="status-callout-box">
            {status === 'READY' && (
              <p className="callout-ready">
                🔔 <strong>Food is Ready!</strong> Please proceed to the collection counter at {canteenName || `Canteen #${order.canteen_id}`}.
              </p>
            )}
            {status === 'PREPARING' && (
              <p className="callout-preparing">
                👨‍🍳 <strong>Kitchen is preparing your order.</strong> It will be ready shortly.
              </p>
            )}
            {status === 'PENDING' && (
              <p className="callout-pending">
                ⏳ <strong>Order received.</strong> Waiting for the kitchen to start preparation.
              </p>
            )}
            {status === 'COLLECTED' && (
              <p className="callout-collected">
                ✓ <strong>Order Collected & Settled.</strong> Thank you!
              </p>
            )}
            {status === 'CANCELLED' && (
              <p className="callout-cancelled">
                ✕ <strong>This order was cancelled.</strong>
              </p>
            )}
          </div>
        </div>

        {/* Progress Step Bar */}
        {status !== 'CANCELLED' && (
          <div className="status-progress-stepper">
            {steps.map((step, idx) => {
              const isPassed = currentStep >= idx;
              const isCurrent = currentStep === idx;

              return (
                <div key={step.key} className="step-item">
                  <div className={`step-circle ${isPassed ? 'step-circle-done' : ''} ${isCurrent ? 'step-circle-current' : ''}`}>
                    {isPassed ? <IconCheck className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span className={`step-label ${isPassed ? 'step-label-done' : ''}`}>{step.label}</span>
                  {idx < steps.length - 1 && (
                    <div className={`step-line ${currentStep > idx ? 'step-line-done' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Itemized Receipt Table */}
        <div className="receipt-section">
          <h4 className="receipt-heading">Itemized Receipt</h4>
          <div className="receipt-items-table">
            {order.items?.map((item) => (
              <div key={item.id} className="receipt-row">
                <div className="receipt-item-col">
                  <span className="receipt-item-qty">{item.quantity}×</span>
                  <span className="receipt-item-name">{item.item_name}</span>
                </div>
                <div className="receipt-price-col">
                  <span className="receipt-unit-price">@ ₹{Math.round(item.unit_price)}</span>
                  <span className="receipt-item-subtotal">₹{Math.round(item.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="receipt-total-bar">
            <span>Total Paid / Payable ({order.payment_status})</span>
            <span className="receipt-grand-total">₹{Math.round(order.total_amount)}</span>
          </div>
        </div>

        {/* Customer & Canteen Info */}
        <div className="order-footer-meta">
          {(order.customer_name || order.customer_phone) && (
            <p>
              <span>Student:</span> {order.customer_name || ''}
              {order.customer_phone ? ` (${order.customer_phone})` : ''}
            </p>
          )}
          <p><span>Canteen:</span> {canteenName || `Canteen #${order.canteen_id}`}</p>
          {order.created_at && (
            <p><span>Placed At:</span> {formatDetailsTimestampIST(order.created_at, order.token_date)}</p>
          )}
        </div>

        {/* Actions */}
        <div className="modal-actions-stacked mt-4">
          {status === 'PENDING' && onCancelOrder && (
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="btn-cancel-order w-full py-2.5 text-sm"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Order'}
            </button>
          )}
          <button onClick={onClose} className="btn-secondary w-full">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
