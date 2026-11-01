import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  fetchCanteens,
  fetchCanteenMenu,
  createOrder,
  fetchOrderById,
  fetchOrderByToken,
  cancelOrder
} from './api';
import { useWebSocket } from './useWebSocket';
import { Header } from './components/Header';
import { CanteenSelector } from './components/CanteenSelector';
import { SearchBar } from './components/SearchBar';
import { CategoryNav } from './components/CategoryNav';
import { FilterBar } from './components/FilterBar';
import { FoodCard } from './components/FoodCard';
import { CartDrawer } from './components/CartDrawer';
import { MobileCartBar } from './components/MobileCartBar';
import { CanteenSwitchModal } from './components/CanteenSwitchModal';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderConfirmationModal } from './components/OrderConfirmationModal';
import { MyOrdersModal } from './components/MyOrdersModal';
import { OrderDetailsModal } from './components/OrderDetailsModal';
import { LegalNoticeModal } from './components/LegalNoticeModal';
import { IconAlertTriangle, IconRefresh } from './components/Icons';
import { getNormalizedDiet } from './dietary';
import {
  STUDENT_THEME_STORAGE_KEY,
  getInitialStudentTheme,
  applyThemeToDocument,
  saveStudentTheme
} from './theme';
import './StudentApp.css';

const LOCAL_STORAGE_ORDERS_KEY = 'food_student_orders';

export default function StudentApp({ onOpenStaffLogin }) {
  // Theme State (Independent 'food_student_theme')
  const [theme, setTheme] = useState(getInitialStudentTheme);

  // Apply theme to document on mount and when theme changes
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  // Listen to OS theme changes if user has no saved manual preference
  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e) => {
      try {
        const saved = localStorage.getItem(STUDENT_THEME_STORAGE_KEY);
        if (!saved) {
          const systemTheme = e.matches ? 'dark' : 'light';
          setTheme(systemTheme);
          applyThemeToDocument(systemTheme);
        }
      } catch (err) {
        console.warn('Could not read theme on system change:', err);
      }
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    saveStudentTheme(nextTheme);
    applyThemeToDocument(nextTheme);
  };

  // Canteens & Menu State
  const [canteens, setCanteens] = useState([]);
  const [activeCanteen, setActiveCanteen] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [loadingCanteens, setLoadingCanteens] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dietFilter, setDietFilter] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Cart State (Never mixes canteens)
  const [cart, setCart] = useState([]);
  const [cartCanteenId, setCartCanteenId] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Modals State
  const [canteenSwitchTarget, setCanteenSwitchTarget] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const isSubmittingOrderRef = useRef(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [legalNoticeOpen, setLegalNoticeOpen] = useState(false);
  const [legalTab, setLegalTab] = useState('privacy');

  // Orders & Tracking State
  const [savedOrders, setSavedOrders] = useState([]);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);

  const menuSectionRef = useRef(null);

  // 1. Load Saved Orders from localStorage on mount (Defensively filtered)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY) || localStorage.getItem('unihub_student_orders');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((o) => o && typeof o === 'object' && o.id);
          setSavedOrders(valid);
        } else {
          setSavedOrders([]);
        }
      }
    } catch (e) {
      console.warn('Failed to read saved orders from localStorage:', e);
      setSavedOrders([]);
    }
  }, []);

  // Save Orders to localStorage helper (Defensively filtered)
  const persistOrders = (newOrders) => {
    const valid = Array.isArray(newOrders)
      ? newOrders.filter((o) => o && typeof o === 'object' && o.id)
      : [];
    setSavedOrders(valid);
    try {
      localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(valid));
    } catch (e) {
      console.warn('Failed to save orders to localStorage:', e);
    }
  };

  // 1.1 WebSocket Live Updates: Canteen Stock & Menu Item Updates
  const canteenWsEndpoint = activeCanteen ? `/ws/canteen/${activeCanteen.id}` : null;
  const handleCanteenWsMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'stock_updated') {
      const updatedStock = Number(msg.stock_quantity);
      const updatedAvail = Boolean(msg.is_available);

      console.log(`[Student App] Applying live stock update for item #${msg.item_id}: stock=${updatedStock}, avail=${updatedAvail}`);

      // 1. Update menuItems state
      setMenuItems((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(msg.item_id)
            ? {
                ...item,
                stock_quantity: updatedStock,
                is_available: updatedAvail
              }
            : item
        )
      );

      // 2. Synchronize active cart tray so student never holds stale stock
      setCart((prevCart) =>
        prevCart.map((cartItem) => {
          if (Number(cartItem.id) === Number(msg.item_id)) {
            return {
              ...cartItem,
              stock_quantity: updatedStock,
              is_available: updatedAvail,
              // If available with stock > 0, clamp to current stock; otherwise retain quantity for out-of-stock badge warning
              quantity: (updatedAvail && updatedStock > 0)
                ? Math.min(cartItem.quantity, updatedStock)
                : cartItem.quantity
            };
          }
          return cartItem;
        })
      );
    } else if (msg.type === 'menu_item_updated' && msg.item) {
      setMenuItems((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(msg.item.id)
            ? { ...item, ...msg.item }
            : item
        )
      );

      setCart((prevCart) =>
        prevCart.map((cartItem) => {
          if (Number(cartItem.id) === Number(msg.item.id)) {
            const updatedStock = Number(msg.item.stock_quantity ?? cartItem.stock_quantity);
            const updatedAvail = Boolean(msg.item.is_available ?? cartItem.is_available);
            return {
              ...cartItem,
              ...msg.item,
              stock_quantity: updatedStock,
              is_available: updatedAvail,
              quantity: (updatedAvail && updatedStock > 0)
                ? Math.min(cartItem.quantity, updatedStock)
                : cartItem.quantity
            };
          }
          return cartItem;
        })
      );
    } else if (msg.type === 'menu_item_created' && msg.item) {
      if (activeCanteen && Number(msg.item.canteen_id) === Number(activeCanteen.id)) {
        setMenuItems((prev) => {
          if (prev.some((it) => Number(it.id) === Number(msg.item.id))) return prev;
          return [...prev, msg.item];
        });
      }
    }
  }, [activeCanteen]);
  useWebSocket(canteenWsEndpoint, handleCanteenWsMessage);

  // 1.2 WebSocket Live Updates: Order Status Updates
  // Track all saved orders in this device session, plus any actively inspected modal
  const trackedOrderIds = useMemo(() => {
    const ids = new Set();
    (savedOrders || []).slice(0, 15).forEach((o) => {
      if (o && o.id) ids.add(Number(o.id));
    });
    if (selectedOrderDetails?.id) ids.add(Number(selectedOrderDetails.id));
    if (confirmedOrder?.id) ids.add(Number(confirmedOrder.id));
    return Array.from(ids).sort((a, b) => a - b);
  }, [savedOrders, selectedOrderDetails?.id, confirmedOrder?.id]);

  const orderWsEndpoint = trackedOrderIds.length > 0 ? `/ws/orders/${trackedOrderIds.join(',')}` : null;
  const handleOrderWsMessage = useCallback((msg) => {
    if (msg.type === 'order_status_updated') {
      const { order_id, status, payment_status, updated_at } = msg;
      setSelectedOrderDetails((prev) =>
        prev && Number(prev.id) === Number(order_id)
          ? {
              ...prev,
              status,
              payment_status: payment_status || prev.payment_status,
              updated_at: updated_at || prev.updated_at
            }
          : prev
      );
      setConfirmedOrder((prev) =>
        prev && Number(prev.id) === Number(order_id)
          ? {
              ...prev,
              status,
              payment_status: payment_status || prev.payment_status,
              updated_at: updated_at || prev.updated_at
            }
          : prev
      );
      setSavedOrders((prev) => {
        const next = prev.map((o) =>
          Number(o.id) === Number(order_id)
            ? {
                ...o,
                status,
                payment_status: payment_status || o.payment_status,
                updated_at: updated_at || o.updated_at
              }
            : o
        );
        try {
          localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    }
  }, []);
  useWebSocket(orderWsEndpoint, handleOrderWsMessage);

  // 1.3 Authoritative Background Sync: Keeps all saved orders up to date with backend
  useEffect(() => {
    if (savedOrders.length === 0) return;
    let isCancelled = false;

    async function syncOrdersWithBackend() {
      try {
        const freshList = await Promise.all(
          savedOrders.map(async (order) => {
            try {
              const fresh = order.daily_token
                ? await fetchOrderByToken(order.daily_token, order.canteen_id, order.token_date)
                : await fetchOrderById(order.id);
              return {
                ...order,
                ...fresh,
                customer_name: order.customer_name || fresh.customer_name,
                customer_phone: order.customer_phone || fresh.customer_phone,
                canteen_name: order.canteen_name || fresh.canteen_name
              };
            } catch (err) {
              return order;
            }
          })
        );
        if (!isCancelled) {
          persistOrders(freshList);
        }
      } catch (err) {
        console.warn('Could not auto-sync orders:', err);
      }
    }

    syncOrdersWithBackend();
    return () => { isCancelled = true; };
  }, [myOrdersOpen]);

  // 2. Initial Fetch of Active Canteens
  const loadCanteens = async () => {
    setLoadingCanteens(true);
    setApiError(null);
    try {
      const data = await fetchCanteens();
      setCanteens(data);
      if (data.length > 0 && !activeCanteen) {
        setActiveCanteen(data[0]);
      }
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoadingCanteens(false);
    }
  };

  useEffect(() => {
    loadCanteens();
  }, []);

  // 3. Fetch Menu whenever activeCanteen changes
  useEffect(() => {
    if (!activeCanteen) return;

    let isMounted = true;
    const loadMenu = async () => {
      setLoadingMenu(true);
      try {
        const items = await fetchCanteenMenu(activeCanteen.id);
        if (isMounted) {
          setMenuItems(items);
          setSelectedCategory(''); // Reset category filter on canteen switch
        }
      } catch (err) {
        if (isMounted) {
          setApiError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoadingMenu(false);
        }
      }
    };

    loadMenu();
    return () => { isMounted = false; };
  }, [activeCanteen?.id]);

  // 4. Calculate Unique Categories for Active Canteen
  const categoriesWithCounts = useMemo(() => {
    const counts = {};
    menuItems.forEach((item) => {
      const cat = (item.category || 'General').trim();
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return Object.entries(counts).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);
  }, [menuItems]);

  // 5. Filtered Menu Items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      // Category filter (Robust, trimmed, case-insensitive)
      if (selectedCategory && selectedCategory.trim()) {
        const itemCat = (item.category || '').trim().toLowerCase();
        const selCat = selectedCategory.trim().toLowerCase();
        if (itemCat !== selCat) {
          return false;
        }
      }

      // Diet filter (veg / non-veg) with robust classification & pure-veg awareness
      if (dietFilter && dietFilter.trim()) {
        const itemDiet = getNormalizedDiet(item, activeCanteen);
        const selDiet = dietFilter.trim().toLowerCase();
        if (itemDiet !== selDiet) {
          return false;
        }
      }

      // In-stock toggle
      if (inStockOnly && (!item.is_available || item.stock_quantity <= 0)) {
        return false;
      }

      // Search query (matches dish name, note, or description)
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (item.name || '').toLowerCase().includes(q);
        const matchesNote = (item.note || '').toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNote && !matchesDesc) {
          return false;
        }
      }

      return true;
    });
  }, [menuItems, selectedCategory, dietFilter, inStockOnly, searchQuery, activeCanteen]);

  // 6. Handle Canteen Selection / Switching Safeguard
  const handleSelectCanteen = (targetCanteen) => {
    if (activeCanteen?.id === targetCanteen.id) {
      menuSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (cart.length > 0 && cartCanteenId !== targetCanteen.id) {
      setCanteenSwitchTarget(targetCanteen);
    } else {
      setActiveCanteen(targetCanteen);
      setCartCanteenId(targetCanteen.id);
      setSelectedCategory('');
      setDietFilter('');
      setSearchQuery('');
      menuSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleConfirmCanteenSwitch = () => {
    if (canteenSwitchTarget) {
      setCart([]);
      setActiveCanteen(canteenSwitchTarget);
      setCartCanteenId(canteenSwitchTarget.id);
      setSelectedCategory('');
      setDietFilter('');
      setSearchQuery('');
      setCanteenSwitchTarget(null);
      menuSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelCanteenSwitch = () => {
    setCanteenSwitchTarget(null);
  };

  // 7. Cart Operations
  const handleAddToCart = (item) => {
    // Guard against adding unavailable or out-of-stock items
    if (!item.is_available || item.stock_quantity <= 0) {
      return;
    }

    if (cart.length > 0 && cartCanteenId !== activeCanteen.id) {
      setCanteenSwitchTarget(activeCanteen);
      return;
    }

    setCartCanteenId(activeCanteen.id);
    setCart((prev) => {
      const existing = prev.find((i) => Number(i.id) === Number(item.id));
      if (existing) {
        if (existing.quantity >= item.stock_quantity) {
          return prev; // Do not exceed available stock
        }
        return prev.map((i) =>
          Number(i.id) === Number(item.id) ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const handleUpdateCartQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveCartItem(itemId);
      return;
    }

    const menuItem = menuItems.find((m) => Number(m.id) === Number(itemId));
    let clampedQuantity = newQuantity;
    if (menuItem) {
      if (!menuItem.is_available || menuItem.stock_quantity <= 0) {
        handleRemoveCartItem(itemId);
        return;
      }
      if (clampedQuantity > menuItem.stock_quantity) {
        clampedQuantity = menuItem.stock_quantity;
      }
    }

    setCart((prev) =>
      prev.map((i) => (Number(i.id) === Number(itemId) ? { ...i, quantity: clampedQuantity } : i))
    );
  };

  const handleRemoveCartItem = (itemId) => {
    setCart((prev) => {
      const next = prev.filter((i) => Number(i.id) !== Number(itemId));
      if (next.length === 0) {
        setCartCanteenId(null);
      }
      return next;
    });
  };

  const cartItemCount = cart.reduce((acc, i) => acc + i.quantity, 0);
  const cartSubtotal = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const cartGstPercent = activeCanteen?.gst_percent || 0;
  const cartGstAmount = cartGstPercent > 0 ? (cartSubtotal * cartGstPercent) / 100 : 0;
  const cartTotal = cartSubtotal + cartGstAmount;

  // 8. Order Placement & Checkout
  const handleProceedToCheckout = () => {
    // Check if any cart item is unavailable or exceeds available stock
    const invalidItem = cart.find(
      (i) => !i.is_available || i.stock_quantity <= 0 || i.quantity > i.stock_quantity
    );
    if (invalidItem) {
      alert(`"${invalidItem.name}" is sold out or exceeds available stock. Please adjust your tray before checkout.`);
      return;
    }

    setCartOpen(false);
    setCheckoutError(null);
    setCheckoutOpen(true);
  };

  const handleConfirmOrder = async ({ customerName, customerPhone, paymentMethod }) => {
    if (isSubmittingOrderRef.current) return;
    isSubmittingOrderRef.current = true;
    setIsSubmittingOrder(true);
    setCheckoutError(null);

    // Final guard before transmitting order
    const invalidItem = cart.find(
      (i) => !i.is_available || i.stock_quantity <= 0 || i.quantity > i.stock_quantity
    );
    if (invalidItem) {
      isSubmittingOrderRef.current = false;
      setIsSubmittingOrder(false);
      setCheckoutError(`"${invalidItem.name}" is sold out or exceeds available stock. Please update your tray.`);
      return;
    }

    const orderPayload = {
      canteen_id: activeCanteen.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      payment_method: paymentMethod,
      items: cart.map((i) => ({
        menu_item_id: i.id,
        quantity: i.quantity
      }))
    };

    try {
      const createdOrder = await createOrder(orderPayload);
      
      setCart([]);
      setCartCanteenId(null);
      setCheckoutOpen(false);

      const enrichedOrder = {
        ...createdOrder,
        canteen_name: activeCanteen.name
      };

      const updatedOrders = [enrichedOrder, ...savedOrders.filter((o) => Number(o.id) !== Number(enrichedOrder.id))];
      persistOrders(updatedOrders);

      setConfirmedOrder(enrichedOrder);

      fetchCanteenMenu(activeCanteen.id).then((freshItems) => setMenuItems(freshItems));
    } catch (err) {
      setCheckoutError(err.message || 'Failed to place order. Please try again.');
    } finally {
      isSubmittingOrderRef.current = false;
      setIsSubmittingOrder(false);
    }
  };

  // 9. Refresh Order Status by ID (Authoritative backend fetch)
  const handleRefreshOrder = async (orderId) => {
    try {
      const existing = savedOrders.find((o) => Number(o.id) === Number(orderId));
      const freshOrder = existing && existing.daily_token
        ? await fetchOrderByToken(existing.daily_token, existing.canteen_id, existing.token_date)
        : await fetchOrderById(orderId);
      setSavedOrders((prev) => {
        const next = prev.map((o) =>
          Number(o.id) === Number(orderId)
            ? {
                ...o,
                ...freshOrder,
                customer_name: o.customer_name || freshOrder.customer_name,
                customer_phone: o.customer_phone || freshOrder.customer_phone,
                canteen_name: o.canteen_name || freshOrder.canteen_name
              }
            : o
        );
        try {
          localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      setSelectedOrderDetails((prev) =>
        prev && Number(prev.id) === Number(orderId)
          ? {
              ...prev,
              ...freshOrder,
              customer_name: prev.customer_name || freshOrder.customer_name,
              customer_phone: prev.customer_phone || freshOrder.customer_phone,
              canteen_name: prev.canteen_name || freshOrder.canteen_name
            }
          : prev
      );
      setConfirmedOrder((prev) =>
        prev && Number(prev.id) === Number(orderId)
          ? {
              ...prev,
              ...freshOrder,
              customer_name: prev.customer_name || freshOrder.customer_name,
              customer_phone: prev.customer_phone || freshOrder.customer_phone,
              canteen_name: prev.canteen_name || freshOrder.canteen_name
            }
          : prev
      );
      return freshOrder;
    } catch (err) {
      console.warn('Could not refresh order:', err);
    }
  };

  // 9.5 Cancel Order (Permitted strictly while status is PENDING)
  const handleCancelOrder = async (orderId) => {
    try {
      const updatedOrder = await cancelOrder(orderId);
      setSavedOrders((prev) => {
        const next = prev.map((o) =>
          Number(o.id) === Number(orderId)
            ? {
                ...o,
                ...updatedOrder,
                canteen_name: o.canteen_name || updatedOrder.canteen_name
              }
            : o
        );
        try {
          localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      setSelectedOrderDetails((prev) =>
        prev && Number(prev.id) === Number(orderId)
          ? {
              ...prev,
              ...updatedOrder,
              canteen_name: prev.canteen_name || updatedOrder.canteen_name
            }
          : prev
      );

      // Refresh active canteen menu items so restored stock appears immediately
      if (activeCanteen?.id) {
        fetchCanteenMenu(activeCanteen.id).then((freshItems) => setMenuItems(freshItems)).catch(() => {});
      }
      return updatedOrder;
    } catch (err) {
      alert(err.message || 'Failed to cancel order.');
      throw err;
    }
  };

  const handleAddTrackedOrder = (order) => {
    const canteen = canteens.find((c) => Number(c.id) === Number(order.canteen_id));
    setSavedOrders((prev) => {
      const existing = prev.find((o) => Number(o.id) === Number(order.id));
      const enriched = {
        ...order,
        customer_name: existing?.customer_name || order.customer_name,
        customer_phone: existing?.customer_phone || order.customer_phone,
        canteen_name: canteen ? canteen.name : (existing?.canteen_name || `Canteen #${order.canteen_id}`)
      };
      const next = [enriched, ...prev.filter((o) => Number(o.id) !== Number(enriched.id))];
      try {
        localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    setSelectedOrderDetails((prev) => {
      const existing = prev && Number(prev.id) === Number(order.id) ? prev : null;
      const canteen = canteens.find((c) => Number(c.id) === Number(order.canteen_id));
      return {
        ...order,
        customer_name: existing?.customer_name || order.customer_name,
        customer_phone: existing?.customer_phone || order.customer_phone,
        canteen_name: canteen ? canteen.name : (existing?.canteen_name || `Canteen #${order.canteen_id}`)
      };
    });
  };

  return (
    <div className="app-shell">
      {/* Top Header */}
      <Header
        activeCanteen={activeCanteen}
        cartItemCount={cartItemCount}
        cartTotal={cartTotal}
        onOpenCart={() => setCartOpen(true)}
        onOpenMyOrders={() => setMyOrdersOpen(true)}
        myOrdersCount={savedOrders.length}
        onSwitchCanteenClick={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenStaffLogin={onOpenStaffLogin}
      />

      <main className="main-content">
        {/* Global Error Banner */}
        {apiError && (
          <div className="error-banner">
            <IconAlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-red-800">Connection Notice</h4>
              <p className="text-sm text-red-700">{apiError}</p>
              <button onClick={loadCanteens} className="btn-retry">
                <IconRefresh className="w-3.5 h-3.5 inline mr-1" /> Retry Connection
              </button>
            </div>
          </div>
        )}

        {/* Canteens Selector Section (No Operating Hours) */}
        {loadingCanteens ? (
          <div className="loading-view">
            <div className="loading-spinner" />
            <p className="loading-text">Loading campus dining outlets...</p>
          </div>
        ) : (
          <CanteenSelector
            canteens={canteens}
            activeCanteen={activeCanteen}
            onSelectCanteen={handleSelectCanteen}
          />
        )}

        {/* Selected Canteen Menu Section */}
        {activeCanteen && (
          <section ref={menuSectionRef} className="menu-section">
            {/* Active Outlet Banner (Timings Completely Removed) */}
            <div className="menu-banner-active">
              <div>
                <span className="text-xs uppercase font-bold text-orange-600 tracking-wider">
                  Viewing Live Menu
                </span>
                <h3 className="banner-title">{activeCanteen.name}</h3>
                <p className="banner-desc">
                  📍 {activeCanteen.location}
                  {activeCanteen.gst_percent ? ` · ${activeCanteen.gst_note || `GST ${activeCanteen.gst_percent}% applied`}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoadingMenu(true);
                    fetchCanteenMenu(activeCanteen.id)
                      .then((items) => {
                        setMenuItems(items);
                        // Synchronize cart items with fresh inventory counts
                        setCart((prevCart) =>
                          prevCart.map((cartItem) => {
                            const fresh = items.find((it) => Number(it.id) === Number(cartItem.id));
                            if (fresh) {
                              const fStock = Number(fresh.stock_quantity);
                              const fAvail = Boolean(fresh.is_available);
                              return {
                                ...cartItem,
                                stock_quantity: fStock,
                                is_available: fAvail,
                                price: fresh.price,
                                name: fresh.name,
                                quantity: (fAvail && fStock > 0)
                                  ? Math.min(cartItem.quantity, fStock)
                                  : cartItem.quantity
                              };
                            }
                            return cartItem;
                          })
                        );
                      })
                      .catch((err) => {
                        console.warn('Failed to refresh canteen stock:', err);
                      })
                      .finally(() => setLoadingMenu(false));
                  }}
                  className="refresh-stock-btn"
                  title="Refresh items & stock"
                >
                  <IconRefresh className={`w-4 h-4 text-gray-500 ${loadingMenu ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-bold text-gray-700">Refresh Stock</span>
                </button>
              </div>
            </div>

            {/* 1. SEARCH BAR - Placed directly ABOVE Category Filters */}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery('')}
              canteenName={activeCanteen.name}
            />

            {/* 2. CATEGORY NAVIGATION PILLS */}
            <CategoryNav
              categories={categoriesWithCounts}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              totalItemsCount={menuItems.length}
            />

            {/* 3. SECONDARY FILTERS: Dietary & In-Stock */}
            <FilterBar
              dietFilter={dietFilter}
              onDietFilterChange={setDietFilter}
              inStockOnly={inStockOnly}
              onInStockToggle={setInStockOnly}
              filteredCount={filteredMenuItems.length}
              isPureVegCanteen={activeCanteen.is_pure_veg}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              onResetAllFilters={() => {
                setSearchQuery('');
                setSelectedCategory('');
                setDietFilter('');
                setInStockOnly(false);
              }}
            />

            {/* Food Items Grid */}
            {loadingMenu ? (
              <div className="loading-view">
                <div className="loading-spinner" />
                <p className="loading-text">Fetching fresh menu items...</p>
              </div>
            ) : filteredMenuItems.length === 0 ? (
              <div className="empty-orders-view bg-white rounded-xl border border-slate-200 py-12">
                <span className="empty-icon">🔍</span>
                <p className="empty-title">No matching food items found</p>
                <p className="empty-sub">
                  Try clearing your search query or adjusting dietary filters.
                </p>
                {(searchQuery || selectedCategory || dietFilter || inStockOnly) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('');
                      setDietFilter('');
                      setInStockOnly(false);
                    }}
                    className="btn-secondary mt-4 text-xs font-bold"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="food-grid">
                {filteredMenuItems.map((item) => {
                  const inCart = cart.find((i) => i.id === item.id);
                  const cartQty = inCart ? inCart.quantity : 0;

                  return (
                    <FoodCard
                      key={item.id}
                      item={item}
                      canteen={activeCanteen}
                      cartQuantity={cartQty}
                      onAddToCart={handleAddToCart}
                      onUpdateQuantity={handleUpdateCartQuantity}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Floating Bottom Cart Bar for Mobile View */}
      <MobileCartBar
        itemCount={cartItemCount}
        totalAmount={cartTotal}
        onOpenCart={() => setCartOpen(true)}
      />

      {/* Slide-over Cart Tray */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cart}
        canteen={activeCanteen}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={handleProceedToCheckout}
      />

      {/* Canteen Switch Warning Modal */}
      <CanteenSwitchModal
        isOpen={!!canteenSwitchTarget}
        currentCanteenName={canteens.find((c) => c.id === cartCanteenId)?.name || 'Previous Canteen'}
        targetCanteenName={canteenSwitchTarget?.name}
        onConfirmSwitch={handleConfirmCanteenSwitch}
        onCancel={handleCancelCanteenSwitch}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        canteen={activeCanteen}
        cartItems={cart}
        onConfirmOrder={handleConfirmOrder}
        isSubmitting={isSubmittingOrder}
        error={checkoutError}
      />

      {/* Post-Checkout Confirmation Modal with Big Daily Token */}
      <OrderConfirmationModal
        order={confirmedOrder}
        canteenName={confirmedOrder?.canteen_name || activeCanteen?.name}
        onClose={() => setConfirmedOrder(null)}
        onViewOrderDetails={(order) => {
          setConfirmedOrder(null);
          setSelectedOrderDetails(order);
        }}
      />

      {/* My Orders Modal */}
      <MyOrdersModal
        isOpen={myOrdersOpen}
        onClose={() => setMyOrdersOpen(false)}
        savedOrders={savedOrders}
        canteens={canteens}
        onRefreshOrder={handleRefreshOrder}
        onSelectOrder={(order) => setSelectedOrderDetails(order)}
        onAddTrackedOrder={handleAddTrackedOrder}
        onCancelOrder={handleCancelOrder}
      />

      {/* Single Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrderDetails}
        canteenName={selectedOrderDetails?.canteen_name}
        isOpen={!!selectedOrderDetails}
        onClose={() => setSelectedOrderDetails(null)}
        onRefresh={handleRefreshOrder}
        onCancelOrder={handleCancelOrder}
      />

      {/* Student Campus Dining Footer */}
      <footer className="student-footer mt-12 py-8 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-500">
        <div className="max-w-4xl mx-auto px-4 space-y-3">
          <p className="font-medium text-gray-700 dark:text-gray-300">
            UniHub Canteen &bull; Campus Pre-Ordering System
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => { setLegalTab('privacy'); setLegalNoticeOpen(true); }}
              className="hover:text-orange-600 underline cursor-pointer"
            >
              Privacy Notice (DPDP)
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => { setLegalTab('terms'); setLegalNoticeOpen(true); }}
              className="hover:text-orange-600 underline cursor-pointer"
            >
              Terms of Use
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => { setLegalTab('refunds'); setLegalNoticeOpen(true); }}
              className="hover:text-orange-600 underline cursor-pointer"
            >
              Refund & Cancellation
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => { setLegalTab('grievance'); setLegalNoticeOpen(true); }}
              className="hover:text-orange-600 underline cursor-pointer"
            >
              Grievance Officer
            </button>
            {onOpenStaffLogin && (
              <>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={onOpenStaffLogin}
                  className="hover:text-orange-600 underline cursor-pointer text-gray-500 font-medium"
                  title="Canteen Kitchen Staff & Owner Portal"
                >
                  Canteen Staff Login
                </button>
              </>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            Zero-Login Prototype &bull; Real-time kitchen token dispatch &bull; Contact: canteen-support@vit.ac.in
          </p>
        </div>
      </footer>

      {/* Legal & Compliance Disclosures Modal */}
      <LegalNoticeModal
        isOpen={legalNoticeOpen}
        initialTab={legalTab}
        onClose={() => setLegalNoticeOpen(false)}
      />
    </div>
  );
}
