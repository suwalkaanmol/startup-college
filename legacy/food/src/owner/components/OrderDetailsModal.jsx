import React, { useState } from 'react';
import {
  IconX,
  IconReceipt,
  IconClock,
  IconUser,
  IconPhone,
  IconStore,
  IconCheckCircle,
  IconChefHat,
  IconPackage,
  IconBan
} from './Icons';
import { formatDetailsTimestampIST } from '../date';

export function OrderDetailsModal({
  order,
  canteenMap = {},
  onClose,
  onUpdateStatus,
  isUpdating
}) {
  const [selectedStatus, setSelectedStatus] = useState(order?.status || 'PENDING');

  if (!order) return null;
  const canteenName = canteenMap[order.canteen_id]?.name || `Canteen #${order.canteen_id}`;

  const handleApplyStatusChange = () => {
    if (selectedStatus === order.status) return;
    onUpdateStatus(order.id, selectedStatus);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-order-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 id="modal-order-title" className="modal-title">
              Order Details #{order.id}
            </h3>
            <span className="modal-sub">
              Placed on {formatDetailsTimestampIST(order.created_at, order.token_date)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="modal-close-btn"
            title="Close modal"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Hero Token Banner */}
        <div className="modal-token-hero">
          <div className="hero-token-left">
            <span className="hero-token-label">DAILY PICKUP TOKEN</span>
            <div className="hero-token-num">{order.daily_token}</div>
            <span className="hero-token-date">Date: {order.token_date}</span>
          </div>
          <div className="hero-token-right">
            <span className="hero-status-label">Current Status</span>
            <span className={`status-pill status-pill-${order.status.toLowerCase()}`}>
              {order.status}
            </span>
            <span className="hero-payment-tag">
              {order.payment_status === 'PAID' ? '✓ PAID' : order.payment_status}
            </span>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="modal-body">
          {/* Metadata Grid */}
          <div className="modal-meta-grid">
            <div className="meta-card">
              <span className="meta-card-label">
                <IconStore size={14} className="inline mr-1" /> Canteen Outlet
              </span>
              <strong className="meta-card-val">{canteenName}</strong>
            </div>

            <div className="meta-card">
              <span className="meta-card-label">
                <IconUser size={14} className="inline mr-1" /> Customer
              </span>
              <strong className="meta-card-val">{order.customer_name}</strong>
            </div>

            <div className="meta-card">
              <span className="meta-card-label">
                <IconPhone size={14} className="inline mr-1" /> Contact Phone
              </span>
              <strong className="meta-card-val">
                <a href={`tel:${order.customer_phone}`} className="phone-link">
                  {order.customer_phone}
                </a>
              </strong>
            </div>

            <div className="meta-card">
              <span className="meta-card-label">
                <IconClock size={14} className="inline mr-1" /> Last Updated
              </span>
              <strong className="meta-card-val">
                {formatDetailsTimestampIST(order.updated_at, order.token_date)}
              </strong>
            </div>
          </div>

          {/* Items Table */}
          <div className="modal-items-section">
            <h4 className="section-heading">
              <IconPackage size={16} className="inline mr-1" />
              Order Items ({order.items ? order.items.length : 0})
            </h4>
            <div className="items-table-wrapper">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th className="text-center">Qty</th>
                    <th className="text-right">Unit Price</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items &&
                    order.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="table-item-name">{item.item_name}</span>
                          <span className="table-item-id">ID: #{item.menu_item_id}</span>
                        </td>
                        <td className="text-center font-bold">{item.quantity}</td>
                        <td className="text-right">₹{item.unit_price}</td>
                        <td className="text-right font-bold">₹{Math.round(item.subtotal)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" className="text-right font-bold">Total Amount:</td>
                    <td className="text-right text-accent font-bold total-cell">
                      ₹{Math.round(order.total_amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Status Change Control Panel */}
          <div className="status-management-card">
            <h4 className="section-heading">Update Order Status</h4>
            {order.status === 'COLLECTED' || order.status === 'CANCELLED' ? (
              <p className="status-notice-text" style={{ color: '#d97706', fontWeight: 600 }}>
                This order is in terminal state (<strong>{order.status}</strong>) and cannot be modified further.
              </p>
            ) : (
              <p className="status-notice-text">
                Note: Marking as <strong>COLLECTED</strong> records payment as <strong>PAID</strong>. Marking as <strong>CANCELLED</strong> restores item inventory in the database.
              </p>
            )}
            <div className="status-changer-row">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="status-select-dropdown"
                disabled={isUpdating || order.status === 'COLLECTED' || order.status === 'CANCELLED'}
              >
                {order.status === 'PENDING' && (
                  <>
                    <option value="PENDING">PENDING (New Order)</option>
                    <option value="PREPARING">PREPARING (In Kitchen)</option>
                    <option value="CANCELLED">CANCELLED (Restore Stock)</option>
                  </>
                )}
                {order.status === 'PREPARING' && (
                  <>
                    <option value="PREPARING">PREPARING (In Kitchen)</option>
                    <option value="READY">READY (Ready for Collection)</option>
                    <option value="CANCELLED">CANCELLED (Restore Stock)</option>
                  </>
                )}
                {order.status === 'READY' && (
                  <>
                    <option value="READY">READY (Ready for Collection)</option>
                    <option value="COLLECTED">COLLECTED (Handed Over & Paid)</option>
                    <option value="CANCELLED">CANCELLED (Restore Stock)</option>
                  </>
                )}
                {order.status === 'COLLECTED' && (
                  <option value="COLLECTED">COLLECTED (Handed Over & Paid)</option>
                )}
                {order.status === 'CANCELLED' && (
                  <option value="CANCELLED">CANCELLED (Restored Stock)</option>
                )}
              </select>

              <button
                type="button"
                onClick={handleApplyStatusChange}
                disabled={
                  isUpdating ||
                  selectedStatus === order.status ||
                  order.status === 'COLLECTED' ||
                  order.status === 'CANCELLED'
                }
                className="btn-apply-status"
              >
                {isUpdating ? (
                  <>
                    <span className="spinner" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Apply Status Change</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-modal-close">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
