import React, { useState } from 'react';
import { IconX, IconReceipt, IconSearch, IconAlertTriangle } from './Icons';
import { fetchOrderByToken } from '../api';
import { formatStudentOrderPlacementIST } from '../date';

export function MyOrdersModal({
  isOpen,
  onClose,
  savedOrders,
  canteens = [],
  onRefreshOrder,
  onSelectOrder,
  onAddTrackedOrder,
  onCancelOrder
}) {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed' | 'cancelled'
  const [searchToken, setSearchToken] = useState('');
  const [tokenSearchLoading, setTokenSearchLoading] = useState(false);
  const [tokenSearchError, setTokenSearchError] = useState(null);

  if (!isOpen) return null;

  const handleTrackByToken = async (e) => {
    e.preventDefault();
    if (!searchToken.trim()) return;

    setTokenSearchLoading(true);
    setTokenSearchError(null);

    try {
      const order = await fetchOrderByToken(searchToken.trim());
      onAddTrackedOrder(order);
      setSearchToken('');
    } catch (err) {
      setTokenSearchError(err.message || `No order found for token '${searchToken.trim()}'.`);
    } finally {
      setTokenSearchLoading(false);
    }
  };


  // Format status cleanly for display
  const formatStatus = (st) => {
    const s = (st || '').trim().toUpperCase();
    switch (s) {
      case 'PENDING': return 'Order Received';
      case 'PREPARING': return 'Preparing';
      case 'READY': return 'Ready for Pickup';
      case 'COLLECTED': return 'Collected';
      case 'CANCELLED': return 'Cancelled';
      default: return st || 'Pending';
    }
  };

  // Resolve actual canteen name
  const getCanteenName = (order) => {
    if (order.canteen_name && order.canteen_name.trim()) {
      return order.canteen_name;
    }
    const found = canteens.find((c) => Number(c.id) === Number(order.canteen_id));
    return found?.name || `Canteen #${order.canteen_id || ''}`;
  };

  // Deduplicate saved orders by unique ID to prevent any duplicate rendering
  const uniqueOrders = React.useMemo(() => {
    const seen = new Set();
    const result = [];
    (savedOrders || []).filter(Boolean).forEach((o) => {
      if (!o || typeof o !== 'object') return;
      const key = String(o.id || o.daily_token || '');
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(o);
      }
    });
    return result;
  }, [savedOrders]);

  // Group orders into authoritative categories
  const activeOrders = uniqueOrders.filter((o) => {
    const st = (o?.status || '').trim().toUpperCase();
    return ['PENDING', 'PREPARING', 'READY'].includes(st);
  });
  const completedOrders = uniqueOrders.filter((o) => {
    const st = (o?.status || '').trim().toUpperCase();
    return st === 'COLLECTED';
  });
  const cancelledOrders = uniqueOrders.filter((o) => {
    const st = (o?.status || '').trim().toUpperCase();
    return st === 'CANCELLED';
  });

  let currentList = activeOrders;
  if (activeTab === 'completed') currentList = completedOrders;
  if (activeTab === 'cancelled') currentList = cancelledOrders;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-orders-modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <IconReceipt className="w-5 h-5 text-orange-600" />
            <div>
              <h3 id="my-orders-modal-title" className="modal-title">My Orders</h3>
              <p className="modal-sub">Track active meals & collection tokens</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            title="Close orders"
            aria-label="Close orders modal"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Token Lookup Bar */}
        <form onSubmit={handleTrackByToken} className="token-lookup-form">
          <div className="token-input-group">
            <IconSearch size={18} className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchToken}
              onChange={(e) => setSearchToken(e.target.value.toUpperCase())}
              placeholder="Track token from another device (e.g. O9, A1)..."
              className="token-lookup-input"
            />
          </div>
          <button
            type="submit"
            disabled={tokenSearchLoading || !searchToken.trim()}
            className="btn-lookup"
          >
            {tokenSearchLoading ? 'Searching...' : 'Track Token'}
          </button>
        </form>

        {tokenSearchError && (
          <div className="lookup-error-badge">
            <IconAlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{tokenSearchError}</span>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="order-tabs-bar">
          <button
            onClick={() => setActiveTab('active')}
            className={`tab-btn ${activeTab === 'active' ? 'tab-btn-active' : ''}`}
          >
            Active Orders ({activeOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`tab-btn ${activeTab === 'completed' ? 'tab-btn-active' : ''}`}
          >
            Collected ({completedOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            className={`tab-btn ${activeTab === 'cancelled' ? 'tab-btn-active' : ''}`}
          >
            Cancelled ({cancelledOrders.length})
          </button>
        </div>

        {/* Orders List */}
        <div className="orders-list-scroll">
          {currentList.length === 0 ? (
            <div className="empty-orders-view">
              <span className="empty-icon">🍱</span>
              <p className="empty-title">
                {activeTab === 'active' ? 'No active orders' : `No ${activeTab} orders`}
              </p>
              <p className="empty-sub">
                {activeTab === 'active'
                  ? 'Your placed orders with tokens will appear here live!'
                  : 'Past orders will be cataloged here once settled.'}
              </p>
              {activeTab === 'active' && completedOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('completed')}
                  className="btn-secondary mt-3 text-xs font-bold"
                >
                  View Collected Orders ({completedOrders.length})
                </button>
              )}
            </div>
          ) : (
            <div className="orders-cards-grid">
              {currentList.map((order) => {
                const canteenName = getCanteenName(order);

                return (
                  <div
                    key={order.id}
                    className="order-card-two-line"
                    onClick={() => onSelectOrder(order)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectOrder(order);
                      }
                    }}
                    aria-label={`Order Token ${order.daily_token}, ${canteenName}, ${formatStatus(order.status)}`}
                  >
                    <div className="my-order-line-1">
                      <strong>Token {order.daily_token} · {canteenName}</strong>
                    </div>
                    <div className="my-order-line-2">
                      {formatStatus(order.status)} · ₹{Math.round(Number(order.total_amount) || 0)} · {formatStudentOrderPlacementIST(order.created_at, order.token_date)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
