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
        aria-labelledby="legal-modal-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="legal-modal-title" className="modal-title">UniHub Canteen Policies & Notice</h3>
            <p className="modal-sub">Compliance with DPDP Act 2023 & Consumer Protection (E-Commerce) Rules 2020</p>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            aria-label="Close legal disclosures modal"
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
            Privacy Notice
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'terms'}
            onClick={() => setActiveTab('terms')}
            className={`tab-btn ${activeTab === 'terms' ? 'tab-btn-active' : ''}`}
          >
            Terms of Use
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'refunds'}
            onClick={() => setActiveTab('refunds')}
            className={`tab-btn ${activeTab === 'refunds' ? 'tab-btn-active' : ''}`}
          >
            Refund & Cancellation
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'grievance'}
            onClick={() => setActiveTab('grievance')}
            className={`tab-btn ${activeTab === 'grievance' ? 'tab-btn-active' : ''}`}
          >
            Grievance Officer
          </button>
        </div>

        <div className="modal-body-content p-4 text-sm text-gray-700 dark:text-gray-300 space-y-4 max-h-[60vh] overflow-y-auto">
          {activeTab === 'privacy' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Digital Personal Data Protection Notice</h4>
              <p>
                In compliance with the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong>, UniHub Canteen informs students of the manner in which their data is processed:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Data Collected:</strong> Customer Full Name and 10-digit Mobile Number provided at the time of pre-ordering.
                </li>
                <li>
                  <strong>Specified Purpose:</strong> Strictly for token identification at the canteen pickup counter, calling out ready orders, and resolving fulfillment issues.
                </li>
                <li>
                  <strong>Zero-Login Architecture:</strong> Students do not create accounts or submit passwords. Orders placed on your device are stored locally in your browser (<code>localStorage</code>) for convenience.
                </li>
                <li>
                  <strong>Data Sharing:</strong> Your information is never sold, shared with advertising networks, or transferred to third parties. Only authorized canteen staff can view your name and phone number for order handover.
                </li>
                <li>
                  <strong>Retention & Deletion:</strong> Order records are retained for statutory canteen accounting. Students may clear local order history at any time using browser storage settings.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Campus Pre-Ordering Terms of Use</h4>
              <p>
                By using UniHub Canteen to reserve food items, you agree to the following campus dining conditions:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Daily Token Validation:</strong> Each confirmed order generates a unique daily token (e.g. A1, B5) tied to the selected canteen outlet and date of ordering.
                </li>
                <li>
                  <strong>Collection Protocol:</strong> You must present your daily token at the designated canteen counter. Counter staff will verify the token and mark the order as COLLECTED.
                </li>
                <li>
                  <strong>Freshness & Pickup Window:</strong> Please collect your order within 20 minutes of status moving to <em>READY</em> to enjoy hot, freshly prepared food.
                </li>
                <li>
                  <strong>Accurate Information:</strong> Please provide a valid mobile number so staff can assist you if a dish runs out or requires substitution.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'refunds' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Refund & Order Cancellation Policy</h4>
              <p>
                Under the <strong>Consumer Protection (E-Commerce) Rules, 2020</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Cash on Collection:</strong> For orders placed with "Pay at Counter on Pickup", no money is debited upfront. If you or the kitchen cancel the order before pickup, no charges apply.
                </li>
                <li>
                  <strong>Kitchen Cancellations:</strong> If the canteen kitchen cannot fulfill an order due to ingredient depletion or emergency closure, the order status will be marked <em>CANCELLED</em>, the food inventory will be automatically restored, and any pending payment obligation will be nullified.
                </li>
                <li>
                  <strong>Non-Refundable Items:</strong> Food prepared, accepted, and handed over at the counter cannot be returned or refunded once collected and consumed, except in cases of quality defects reported immediately at the counter.
                </li>
                <li>
                  <strong>Simulated UPI Payments:</strong> In the current college testing phase, simulated UPI transactions carry no actual bank debits.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'grievance' && (
            <div className="space-y-3">
              <h4 className="font-bold text-base text-gray-900 dark:text-white">Grievance Redressal & Campus Contact</h4>
              <p>
                For grievances regarding order discrepancies, quality concerns, or data privacy requests:
              </p>
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg space-y-1 border border-gray-200 dark:border-gray-700">
                <p><strong>Grievance Officer:</strong> UniHub Student Welfare & Canteen Committee</p>
                <p><strong>Address:</strong> Campus Food Court Desk, Student Centre, VIT Campus</p>
                <p><strong>Email:</strong> <a href="mailto:canteen-support@vit.ac.in" className="text-orange-600 underline">canteen-support@vit.ac.in</a></p>
                <p><strong>Helpdesk Hours:</strong> 08:30 AM – 08:00 PM (Monday through Sunday)</p>
                <p><strong>Phone:</strong> +91 416 220 2000 (Ext. 4102)</p>
              </div>
              <p className="text-xs text-gray-500">
                Grievances are acknowledged within 48 hours and resolved within 30 days as mandated by consumer protection regulations.
              </p>
            </div>
          )}
        </div>

        <div className="modal-actions-row">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
