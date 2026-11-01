import React, { useState } from 'react';
import {
  IconSearch,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
  IconUser,
  IconPhone,
  IconPackage,
  IconX
} from './Icons';

export function TokenVerificationPanel({
  onVerifyToken,
  selectedCanteenName,
  isVerifying,
  lastVerificationResult,
  onClearVerification
}) {
  const [tokenInput, setTokenInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tokenInput.trim() || isVerifying) return;
    onVerifyToken(tokenInput.trim().toUpperCase());
  };

  const handleClear = () => {
    setTokenInput('');
    if (onClearVerification) {
      onClearVerification();
    }
  };

  return (
    <section className="token-verify-section">
      <div className="token-verify-card">
        <div className="token-verify-header">
          <div className="token-verify-title-group">
            <h2 className="token-verify-title">
              <span className="verify-badge">Pickup Counter</span> Token Verification
            </h2>
            <p className="token-verify-sub">
              Verify student daily token to complete collection and settle payment
              {selectedCanteenName && (
                <span className="canteen-scope-badge">
                  Scoped to: <strong>{selectedCanteenName}</strong>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Form Input */}
        <form onSubmit={handleSubmit} className="token-verify-form">
          <div className="token-input-wrapper">
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
              placeholder="Enter Daily Token (e.g. O20, A1, B3)..."
              className="token-text-input"
              maxLength={10}
              autoComplete="off"
              disabled={isVerifying}
            />
            {tokenInput && (
              <button
                type="button"
                onClick={handleClear}
                className="clear-token-btn"
                title="Clear input"
              >
                <IconX size={16} />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!tokenInput.trim() || isVerifying}
            className="verify-action-btn"
          >
            {isVerifying ? (
              <>
                <span className="spinner" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <IconCheckCircle size={18} />
                <span>Verify & Hand Over</span>
              </>
            )}
          </button>
        </form>

        {/* Result Callout Display */}
        {lastVerificationResult && (
          <div
            className={`verification-result-box ${
              lastVerificationResult.success
                ? 'result-box-success'
                : lastVerificationResult.status === 404
                ? 'result-box-notfound'
                : 'result-box-warning'
            }`}
          >
            <div className="result-header">
              <div className="result-icon-wrap">
                {lastVerificationResult.success ? (
                  <IconCheckCircle size={22} className="text-emerald-500" />
                ) : (
                  <IconAlertCircle size={22} className="text-amber-500" />
                )}
              </div>
              <div className="result-title-wrap">
                <h4 className="result-heading">
                  {lastVerificationResult.success
                    ? 'Token Verified & Order Collected'
                    : 'Verification Notice'}
                </h4>
                <p className="result-message">{lastVerificationResult.message}</p>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="close-result-btn"
                title="Dismiss result"
              >
                <IconX size={16} />
              </button>
            </div>

            {/* If Order Data Returned in Response */}
            {lastVerificationResult.order && (
              <div className="result-order-details">
                <div className="result-meta-row">
                  <div className="meta-chip">
                    <span className="meta-chip-label">Daily Token</span>
                    <strong className="meta-chip-val token-val">
                      {lastVerificationResult.order.daily_token}
                    </strong>
                  </div>
                  <div className="meta-chip">
                    <span className="meta-chip-label">Customer</span>
                    <strong className="meta-chip-val">
                      <IconUser size={13} className="inline mr-1" />
                      {lastVerificationResult.order.customer_name}
                    </strong>
                  </div>
                  <div className="meta-chip">
                    <span className="meta-chip-label">Phone</span>
                    <strong className="meta-chip-val">
                      <IconPhone size={13} className="inline mr-1" />
                      {lastVerificationResult.order.customer_phone}
                    </strong>
                  </div>
                  <div className="meta-chip">
                    <span className="meta-chip-label">Status</span>
                    <span
                      className={`status-pill status-pill-${lastVerificationResult.order.status.toLowerCase()}`}
                    >
                      {lastVerificationResult.order.status}
                    </span>
                  </div>
                  <div className="meta-chip">
                    <span className="meta-chip-label">Payment</span>
                    <span className="payment-settled-badge">
                      ✓ {lastVerificationResult.order.payment_status} (₹
                      {Math.round(lastVerificationResult.order.total_amount)})
                    </span>
                  </div>
                </div>

                {/* Items preview */}
                {lastVerificationResult.order.items &&
                  lastVerificationResult.order.items.length > 0 && (
                    <div className="result-items-summary">
                      <span className="summary-title">
                        <IconPackage size={14} className="inline mr-1" />
                        Dishes to Hand Over:
                      </span>
                      <div className="summary-pills">
                        {lastVerificationResult.order.items.map((it) => (
                          <span key={it.id} className="item-handover-pill">
                            <strong>{it.quantity}×</strong> {it.item_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
