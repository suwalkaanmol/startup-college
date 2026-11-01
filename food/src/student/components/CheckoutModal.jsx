import React, { useState } from 'react';
import { IconX, IconCheck, IconAlertTriangle } from './Icons';

export function CheckoutModal({
  isOpen,
  onClose,
  canteen,
  cartItems,
  onConfirmOrder,
  isSubmitting,
  error
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH_ON_COLLECTION');
  const [formErrors, setFormErrors] = useState({});

  if (!isOpen) return null;

  const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const gstPercent = canteen?.gst_percent || 0;
  const gstAmount = gstPercent > 0 ? (subtotal * gstPercent) / 100 : 0;
  const grandTotal = subtotal + gstAmount;

  const validate = () => {
    const errors = {};
    if (!customerName.trim() || customerName.trim().length < 2) {
      errors.name = 'Please enter your full name (at least 2 letters).';
    }
    const cleanPhone = customerPhone.trim().replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      errors.phone = 'Please enter a valid 10-digit mobile number for order notification.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onConfirmOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      paymentMethod,
    });
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal-dialog modal-dialog-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 id="checkout-modal-title" className="modal-title">Complete Pre-order</h3>
            <p className="modal-sub">Outlet: <strong>{canteen?.name}</strong></p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="modal-close-btn"
            aria-label="Close checkout modal"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Server Error Alert */}
        {error && (
          <div className="alert-error-box">
            <IconAlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="alert-text">
              <strong>Order Failed:</strong> {error}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="checkout-form">
          {/* Customer Details */}
          <div className="form-section">
            <h4 className="form-section-title">1. Student Details (No Login Needed)</h4>
            
            <div className="input-group">
              <label htmlFor="checkout-student-name" className="input-label">Student Name *</label>
              <input
                id="checkout-student-name"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className={`text-input ${formErrors.name ? 'input-error' : ''}`}
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!formErrors.name}
                aria-describedby={formErrors.name ? 'student-name-error' : undefined}
                autoFocus
              />
              {formErrors.name && (
                <p id="student-name-error" className="field-error-text" role="alert">
                  {formErrors.name}
                </p>
              )}
            </div>

            <div className="input-group">
              <label htmlFor="checkout-customer-phone" className="input-label">Mobile Number *</label>
              <input
                id="checkout-customer-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className={`text-input ${formErrors.phone ? 'input-error' : ''}`}
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!formErrors.phone}
                aria-describedby={formErrors.phone ? 'customer-phone-error' : 'customer-phone-hint'}
              />
              <span id="customer-phone-hint" className="field-hint">Used by counter staff to call your order if needed.</span>
              {formErrors.phone && (
                <p id="customer-phone-error" className="field-error-text" role="alert">
                  {formErrors.phone}
                </p>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="form-section">
            <h4 className="form-section-title">2. Payment Method</h4>
            
            <div className="payment-options">
              <label className={`payment-card ${paymentMethod === 'CASH_ON_COLLECTION' ? 'payment-card-selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CASH_ON_COLLECTION"
                  checked={paymentMethod === 'CASH_ON_COLLECTION'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="sr-only"
                />
                <div className="payment-radio-circle">
                  {paymentMethod === 'CASH_ON_COLLECTION' && <div className="radio-inner" />}
                </div>
                <div className="payment-label-wrap">
                  <span className="payment-main-label">💵 Pay at Counter on Pickup</span>
                  <span className="payment-sub-label">Pay with Cash, GPay, or UPI when collecting your food token.</span>
                </div>
              </label>

              <label className={`payment-card ${paymentMethod === 'UPI' ? 'payment-card-selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="UPI"
                  checked={paymentMethod === 'UPI'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="sr-only"
                />
                <div className="payment-radio-circle">
                  {paymentMethod === 'UPI' && <div className="radio-inner" />}
                </div>
                <div className="payment-label-wrap">
                  <span className="payment-main-label">⚡ Simulated UPI Instant Pre-pay</span>
                  <span className="payment-sub-label">Simulates instant online settlement for this college prototype.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Order Summary Breakdown */}
          <div className="checkout-summary-box">
            <div className="summary-header">
              <span>Items in Order ({cartItems.reduce((acc, i) => acc + i.quantity, 0)})</span>
              <span>₹{Math.round(subtotal)}</span>
            </div>
            {gstPercent > 0 && (
              <div className="summary-row">
                <span>GST ({gstPercent}%)</span>
                <span>+₹{Math.round(gstAmount)}</span>
              </div>
            )}
            <div className="summary-total-row">
              <span>Grand Total</span>
              <span className="grand-total-price">₹{Math.round(grandTotal)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="modal-actions-row">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? (
                <span className="btn-spinner-wrap">
                  <span className="spinner" /> Placing Order...
                </span>
              ) : (
                <span>Confirm & Get Daily Token</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
