import React from 'react';
import { IconAlertTriangle } from './Icons';

export function CanteenSwitchModal({
  isOpen,
  currentCanteenName,
  targetCanteenName,
  onConfirmSwitch,
  onCancel
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog modal-dialog-sm">
        <div className="modal-icon-header">
          <div className="warning-icon-wrap">
            <IconAlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
        </div>

        <h3 className="modal-title text-center">Switch Canteen?</h3>
        <p className="modal-desc text-center">
          Your cart currently contains items from <strong>{currentCanteenName}</strong>.
          <br /><br />
          To order from <strong>{targetCanteenName}</strong>, your current cart must be cleared because canteens prepare orders independently.
        </p>

        <div className="modal-actions-stacked">
          <button
            onClick={onConfirmSwitch}
            className="btn-danger-primary"
          >
            Clear Cart & Switch Outlet
          </button>
          <button
            onClick={onCancel}
            className="btn-secondary"
          >
            Keep Current Cart
          </button>
        </div>
      </div>
    </div>
  );
}
