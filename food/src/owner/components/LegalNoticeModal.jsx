import React, { useState } from 'react';
import { IconX } from './Icons';

export function LegalNoticeModal({ isOpen, onClose, initialTab = 'privacy' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-legal-modal-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="owner-legal-modal-title" className="modal-title">Canteen Operator Disclosures & Policies</h3>
            <p className="modal-sub">Compliance with DPDP Act 2023 & Consumer Protection (E-Commerce) Rules 2020</p>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            aria-label="Close operator policies modal"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="order-tabs-bar" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'privacy'}
            onClick={() => setActiveTab('privacy')}
            className={`tab-btn ${activeTab === 'privacy' ? 'tab-btn-active' : ''}`}
          >
            DPDP Compliance
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'fulfillment'}
            onClick={() => setActiveTab('fulfillment')}
            className={`tab-btn ${activeTab === 'fulfillment' ? 'tab-btn-active' : ''}`}
          >
            Operator Obligations
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'refunds'}
            onClick={() => setActiveTab('refunds')}
            className={`tab-btn ${activeTab === 'refunds' ? 'tab-btn-active' : ''}`}
          >
            Cancellation Policy
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'grievance'}
            onClick={() => setActiveTab('grievance')}
            className={`tab-btn ${activeTab === 'grievance' ? 'tab-btn-active' : ''}`}
          >
            Grievance Contact
          </button>
        </div>

        <div className="modal-body-content p-4 text-sm text-gray-700 dark:text-gray-300 space-y-4 max-h-[60vh] overflow-y-auto">
          {activeTab === 'privacy' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Student Personal Data Handling Rules</h4>
              <p>
                As a Canteen Operator, you process student personal data under the <strong>Digital Personal Data Protection Act, 2023</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Authorized Purpose:</strong> Student name and phone number visible in the kitchen queue may only be used to call tokens and verify collections.
                </li>
                <li>
                  <strong>No Secondary Contact:</strong> Operators may NOT copy student phone numbers into personal phones, send promotional WhatsApp messages, or contact students outside order fulfillment.
                </li>
                <li>
                  <strong>Confidentiality:</strong> Kitchen displays must remain oriented toward canteen staff and not turned toward the public queue.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'fulfillment' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Kitchen Fulfillment Obligations</h4>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Stock Accuracy:</strong> Maintain live item stock in the Menu Management tab to prevent students from ordering depleted ingredients.
                </li>
                <li>
                  <strong>State Transitions:</strong> Move orders sequentially from <em>PENDING</em> to <em>PREPARING</em> and <em>READY</em> to keep student wait times accurate.
                </li>
                <li>
                  <strong>Token Verification:</strong> Always scan or verify daily tokens at the collection counter before handing over food items.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'refunds' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Cancellation & Stock Restoration Rules</h4>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Kitchen Cancellation:</strong> If an order cannot be prepared due to stock depletion, mark it <em>CANCELLED</em> promptly. The system will automatically restore any deducted inventory items.
                </li>
                <li>
                  <strong>Zero Charges:</strong> Cancelled orders automatically relieve students of any payment obligation.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'grievance' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Campus Canteen Administration</h4>
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg space-y-1 border border-gray-200 dark:border-gray-700">
                <p><strong>Canteen Oversight Office:</strong> Student Welfare Directorate, Food Services Section</p>
                <p><strong>Campus Location:</strong> Central Administration Building, Ground Floor</p>
                <p><strong>Support Email:</strong> <a href="mailto:canteen-support@vit.ac.in" className="text-orange-600 underline">canteen-support@vit.ac.in</a></p>
                <p><strong>Internal Extension:</strong> 4102 / 4103</p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions-row">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
