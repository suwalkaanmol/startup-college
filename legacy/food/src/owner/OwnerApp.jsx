import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  fetchCanteens,
  fetchOrders,
  fetchSystemInfo,
  updateOrderStatus,
  verifyTokenAndCollect,
  getAuthToken,
  getAuthUser,
  clearAuthSession
} from './api';
import {
  OWNER_THEME_STORAGE_KEY,
  getInitialOwnerTheme,
  applyOwnerThemeToDocument,
  saveOwnerTheme
} from './theme';
import { OwnerLogin } from './components/OwnerLogin';
import { OwnerHeader } from './components/OwnerHeader';
import { TokenVerificationPanel } from './components/TokenVerificationPanel';
import { OrderStatsBar } from './components/OrderStatsBar';
import { OrderFilterBar } from './components/OrderFilterBar';
import { OrderCard } from './components/OrderCard';
import { OrderDetailsModal } from './components/OrderDetailsModal';
import { StockQuickManagerModal } from './components/StockQuickManagerModal';
import { LegalNoticeModal } from './components/LegalNoticeModal';
import { IconAlertCircle, IconRefresh, IconReceipt } from './components/Icons';
import { parseOrderDate } from './date';
import { useWebSocket } from './useWebSocket';
import './OwnerApp.css';

export default function OwnerApp({ onSwitchToStudent }) {
  // 1. Theme State (Independent 'food_owner_theme')
  const [theme, setTheme] = useState(getInitialOwnerTheme);

  useEffect(() => {
    applyOwnerThemeToDocument(theme);
  }, [theme]);

  // Sync with OS theme changes if user hasn't set an explicit preference
  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e) => {
      try {
        const saved = localStorage.getItem(OWNER_THEME_STORAGE_KEY);
        if (!saved) {
          const sysTheme = e.matches ? 'dark' : 'light';
          setTheme(sysTheme);
          applyOwnerThemeToDocument(sysTheme);
        }
      } catch (err) {
        console.warn('Theme listener error:', err);
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    saveOwnerTheme(nextTheme);
    applyOwnerThemeToDocument(nextTheme);
  };

  // 1.5 Owner Authentication State
  const [currentUser, setCurrentUser] = useState(getAuthUser);
  const [authToken, setAuthToken] = useState(getAuthToken);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  // 2. Canteens & System State (Scoped strictly to authenticated owner's canteen)
  const [canteens, setCanteens] = useState([]);
  const [selectedCanteenId, setSelectedCanteenId] = useState(currentUser?.canteen_id || null);
  const [systemInfo, setSystemInfo] = useState(null);

  // Keep selectedCanteenId locked to currentUser's assigned canteen
  useEffect(() => {
    if (currentUser?.canteen_id) {
      setSelectedCanteenId(currentUser.canteen_id);
    }
  }, [currentUser]);

  // Global listener for session expiration triggered by API 401s
  useEffect(() => {
    const handleExpired = () => {
      setCurrentUser(null);
      setAuthToken(null);
      setSelectedCanteenId(null);
      setSessionExpiredNotice(true);
    };
    window.addEventListener('unihub-auth-expired', handleExpired);
    return () => window.removeEventListener('unihub-auth-expired', handleExpired);
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    setCurrentUser(null);
    setAuthToken(null);
    setSelectedCanteenId(null);
    setOrders([]);
    setSessionExpiredNotice(false);
  };

  // 3. Orders State
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ordersError, setOrdersError] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  // 4. Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest' | 'token'

  // 5. Auto-Refresh State (15s polling)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const autoRefreshTimerRef = useRef(null);

  // 6. Token Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [lastVerificationResult, setLastVerificationResult] = useState(null);

  // 7. Modals State
  const [inspectOrder, setInspectOrder] = useState(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);

  // Map of canteens by ID for quick lookup
  const canteenMap = useMemo(() => {
    const map = {};
    canteens.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [canteens]);

  const selectedCanteenName = selectedCanteenId ? canteenMap[selectedCanteenId]?.name : null;

  // 8. Fetch Initial Data (Canteens & System Info)
  useEffect(() => {
    async function initData() {
      try {
        const [canteensData, sysData] = await Promise.all([
          fetchCanteens().catch(() => []),
          fetchSystemInfo().catch(() => null)
        ]);
        setCanteens(canteensData);
        setSystemInfo(sysData);
      } catch (err) {
        console.error('Failed to initialize portal data:', err);
      }
    }
    initData();
  }, []);

  // 9. Load Orders Callback (Scoped strictly to authenticated owner's canteen)
  const loadOrders = useCallback(
    async (showLoadingSpinner = false) => {
      if (!selectedCanteenId || !authToken) return;
      if (showLoadingSpinner) setLoadingOrders(true);
      setIsRefreshing(true);
      setOrdersError(null);
      try {
        const fetchedOrders = await fetchOrders({
          canteenId: selectedCanteenId,
          limit: 200,
        });
        setOrders(fetchedOrders);
      } catch (err) {
        setOrdersError(
          err.message || 'Unable to fetch orders. Please check backend connection.'
        );
      } finally {
        if (showLoadingSpinner) setLoadingOrders(false);
        setIsRefreshing(false);
      }
    },
    [selectedCanteenId, authToken]
  );

  // Re-fetch orders when selectedCanteenId changes
  useEffect(() => {
    if (authToken && selectedCanteenId) {
      loadOrders(true);
    }
  }, [loadOrders, authToken, selectedCanteenId]);

  // 10. WebSocket Live Updates with Fallback (Secured by In-Band Authentication Handshake)
  const wsEndpoint = authToken ? '/ws/owner' : null;

  const handleWsMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'new_order' && msg.order) {
      // Check if order belongs to the currently active canteen filter
      if (selectedCanteenId && msg.order.canteen_id !== selectedCanteenId) return;

      setOrders((prev) => {
        // Prevent duplicate append
        if (prev.some((o) => o.id === msg.order.id)) return prev;
        return [msg.order, ...prev];
      });
    } else if (msg.type === 'order_status_updated') {
      const { order_id, status, payment_status, updated_at } = msg;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order_id
            ? { ...o, status, payment_status: payment_status || o.payment_status, updated_at: updated_at || o.updated_at }
            : o
        )
      );
      if (inspectOrder && inspectOrder.id === order_id) {
        setInspectOrder((prev) => ({
          ...prev,
          status,
          payment_status: payment_status || prev.payment_status,
          updated_at: updated_at || prev.updated_at
        }));
      }
    }
  }, [selectedCanteenId, inspectOrder]);

  const { isConnected: isWsConnected } = useWebSocket(wsEndpoint, handleWsMessage, authToken);

  // Auto-Refresh Polling Fallback (runs every 15s if WS is disconnected, or if enabled)
  useEffect(() => {
    if (!autoRefreshEnabled) {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
      return;
    }

    // If WebSocket is actively connected, background polling is relaxed to 45s (fallback health)
    const pollInterval = isWsConnected ? 45000 : 15000;

    autoRefreshTimerRef.current = setInterval(() => {
      if (!inspectOrder && !stockModalOpen && !isVerifying) {
        loadOrders(false);
      }
    }, pollInterval);

    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    };
  }, [autoRefreshEnabled, isWsConnected, inspectOrder, stockModalOpen, isVerifying, loadOrders]);

  // 11. Handle Order Status Update
  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdatingOrderId(orderId);
    try {
      const updatedOrder = await updateOrderStatus(orderId, newStatus);
      // Update local state immediately
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updatedOrder } : o))
      );
      if (inspectOrder && inspectOrder.id === orderId) {
        setInspectOrder((prev) => ({ ...prev, ...updatedOrder }));
      }
    } catch (err) {
      alert(`Could not update status: ${err.message}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // 12. Handle Daily Token Verification (Pickup Counter)
  const handleVerifyToken = async (token) => {
    setIsVerifying(true);
    setLastVerificationResult(null);
    try {
      const result = await verifyTokenAndCollect(token, selectedCanteenId);
      setLastVerificationResult(result);
      if (result.success && result.order) {
        // Refresh local orders list to reflect the verified order state
        setOrders((prev) =>
          prev.map((o) => (o.id === result.order.id ? { ...o, ...result.order } : o))
        );
      }
    } catch (err) {
      setLastVerificationResult({
        success: false,
        status: err.status || 500,
        message: err.message || 'Token verification failed.',
        order: null
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // 13. Filter & Sort Orders
  const filteredAndSortedOrders = useMemo(() => {
    let result = [...orders];

    // Status filter
    if (statusFilter) {
      result = result.filter((o) => o.status === statusFilter);
    }

    // Search query filter (token, name, phone, dish title)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace('#', '');
      result = result.filter((o) => {
        const matchToken = o.daily_token && o.daily_token.toLowerCase().includes(q);
        const matchName = o.customer_name && o.customer_name.toLowerCase().includes(q);
        const matchPhone = o.customer_phone && o.customer_phone.toLowerCase().includes(q);
        const matchOrderId = String(o.id).includes(q);
        const matchItems =
          o.items &&
          o.items.some((i) => i.item_name && i.item_name.toLowerCase().includes(q));

        return matchToken || matchName || matchPhone || matchOrderId || matchItems;
      });
    }

    // Sorting
    result.sort((a, b) => {
      if (sortOrder === 'newest') {
        const da = parseOrderDate(a.created_at);
        const db = parseOrderDate(b.created_at);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      }
      if (sortOrder === 'oldest') {
        const da = parseOrderDate(a.created_at);
        const db = parseOrderDate(b.created_at);
        return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
      }
      if (sortOrder === 'token') {
        return (a.daily_token || '').localeCompare(b.daily_token || '');
      }
      return 0;
    });

    return result;
  }, [orders, statusFilter, searchQuery, sortOrder]);

  // If not authenticated, display login screen
  if (!authToken || !currentUser) {
    return (
      <OwnerLogin
        theme={theme}
        onToggleTheme={handleToggleTheme}
        sessionExpiredNotice={sessionExpiredNotice}
        onSwitchToStudent={onSwitchToStudent}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setAuthToken(getAuthToken());
          setSelectedCanteenId(user.canteen_id);
          setSessionExpiredNotice(false);
        }}
      />
    );
  }

  return (
    <div className="app-root">
      {/* Header Banner */}
      <OwnerHeader
        canteens={canteens}
        selectedCanteenId={selectedCanteenId}
        assignedCanteenName={currentUser?.canteen_name || selectedCanteenName}
        authUser={currentUser}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onRefreshOrders={() => loadOrders(false)}
        isRefreshing={isRefreshing}
        autoRefreshEnabled={autoRefreshEnabled}
        onToggleAutoRefresh={() => setAutoRefreshEnabled((prev) => !prev)}
        onOpenStockModal={() => setStockModalOpen(true)}
        systemInfo={systemInfo}
        isWsConnected={isWsConnected}
        onSwitchToStudent={onSwitchToStudent}
      />

      <main className="main-content">
        {/* Pickup Token Verification Counter Panel */}
        <TokenVerificationPanel
          onVerifyToken={handleVerifyToken}
          selectedCanteenName={selectedCanteenName}
          isVerifying={isVerifying}
          lastVerificationResult={lastVerificationResult}
          onClearVerification={() => setLastVerificationResult(null)}
        />

        {/* Metric Summary Tiles (Clicking filters by status) */}
        <OrderStatsBar
          orders={orders}
          activeStatusFilter={statusFilter}
          onSelectStatusFilter={setStatusFilter}
        />

        {/* Search, Filter & Sort Bar */}
        <OrderFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onResetFilters={() => {
            setSearchQuery('');
            setStatusFilter('');
          }}
          totalFilteredCount={filteredAndSortedOrders.length}
          totalOrdersCount={orders.length}
        />

        {/* Error Notice Banner */}
        {ordersError && (
          <div className="error-banner">
            <IconAlertCircle size={20} />
            <div className="flex-1">
              <strong>Connection Notice:</strong> {ordersError}
            </div>
            <button
              type="button"
              onClick={() => loadOrders(true)}
              className="action-btn"
            >
              <IconRefresh size={14} className="inline mr-1" /> Retry
            </button>
          </div>
        )}

        {/* Orders List View */}
        {loadingOrders ? (
          <div className="loading-view">
            <div className="loading-spinner" />
            <p className="loading-text">Loading incoming canteen orders...</p>
          </div>
        ) : filteredAndSortedOrders.length === 0 ? (
          <div className="empty-view">
            <span className="empty-icon">📋</span>
            <h3 className="empty-title">No matching orders found</h3>
            <p className="empty-sub">
              {searchQuery || statusFilter
                ? 'Try adjusting your search query or status filter to see other orders.'
                : selectedCanteenName
                ? `No orders currently queued for ${selectedCanteenName}. New orders will automatically appear here.`
                : 'No orders currently queued. Incoming student pre-orders will automatically appear here.'}
            </p>
          </div>
        ) : (
          <div className="orders-grid">
            {filteredAndSortedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                canteenMap={canteenMap}
                onUpdateStatus={handleUpdateStatus}
                onViewDetails={(ord) => setInspectOrder(ord)}
                isUpdating={updatingOrderId === order.id}
              />
            ))}
          </div>
        )}
      </main>

      {/* Full Order Inspection Modal */}
      {inspectOrder && (
        <OrderDetailsModal
          order={inspectOrder}
          canteenMap={canteenMap}
          onClose={() => setInspectOrder(null)}
          onUpdateStatus={handleUpdateStatus}
          isUpdating={updatingOrderId === inspectOrder.id}
        />
      )}

      {/* Canteen Inventory & Quick Stock Manager Modal (Scoped to Owner's Canteen) */}
      {stockModalOpen && (
        <StockQuickManagerModal
          canteens={canteens}
          initialCanteenId={selectedCanteenId}
          assignedCanteenId={currentUser?.canteen_id}
          onClose={() => setStockModalOpen(false)}
        />
      )}

      {/* Operator Legal & DPDP Compliance Footer */}
      <footer className="owner-footer mt-8 py-4 border-t border-gray-200 text-center text-xs text-gray-500">
        <p>
          UniHub Canteen Operations &bull; Authorised Kitchen Portal &bull;{' '}
          <button
            type="button"
            onClick={() => setLegalModalOpen(true)}
            className="hover:underline text-indigo-600 font-medium cursor-pointer"
          >
            Operator DPDP Compliance & Policies
          </button>
        </p>
      </footer>

      {legalModalOpen && (
        <LegalNoticeModal
          isOpen={legalModalOpen}
          onClose={() => setLegalModalOpen(false)}
        />
      )}
    </div>
  );
}
