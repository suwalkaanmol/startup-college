import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IconX,
  IconBoxes,
  IconSearch,
  IconCheck,
  IconRefresh,
  IconAlertCircle,
  IconPlus,
  IconEdit,
  IconVeg,
  IconNonVeg,
  IconStore,
  IconLock
} from './Icons';
import {
  fetchCanteenMenu,
  updateMenuItemStock,
  createMenuItem,
  updateMenuItem
} from '../api';
import { useWebSocket } from '../useWebSocket';

export function StockQuickManagerModal({
  canteens = [],
  initialCanteenId,
  assignedCanteenId = null,
  onClose
}) {
  const activeCanteenId = assignedCanteenId || initialCanteenId || (canteens.length > 0 ? canteens[0].id : null);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Modal form states: null | 'add' | item object for 'edit'
  const [itemModalMode, setItemModalMode] = useState(null); // 'add' or 'edit'
  const [editingItem, setEditingItem] = useState(null);

  // Form input fields
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDiet, setFormDiet] = useState('veg'); // 'veg' or 'non-veg'
  const [formStock, setFormStock] = useState('50');
  const [formAvailable, setFormAvailable] = useState(true);
  const [formNote, setFormNote] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const activeCanteen = useMemo(
    () => canteens.find((c) => c.id === activeCanteenId) || null,
    [canteens, activeCanteenId]
  );

  const isPureVegCanteen = Boolean(
    activeCanteen && (activeCanteen.is_pure_veg || activeCanteen.pure_veg)
  );

  const loadMenu = async (canteenId) => {
    if (!canteenId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCanteenMenu(canteenId);
      setMenuItems(data);
    } catch (err) {
      setError(err.message || 'Failed to load canteen menu items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeCanteenId) {
      loadMenu(activeCanteenId);
      setItemModalMode(null);
      setEditingItem(null);
    }
  }, [activeCanteenId]);

  // Live WebSocket subscription so stock adjustments from orders or other manager tabs
  // update the modal instantly, preventing overwrites of fresher backend values
  const canteenWsEndpoint = activeCanteenId ? `/ws/canteen/${activeCanteenId}` : null;
  const handleCanteenWsMessage = useCallback((msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'stock_updated') {
      if (msg.canteen_id && Number(msg.canteen_id) !== Number(activeCanteenId)) return;
      setMenuItems((prev) =>
        prev.map((i) =>
          Number(i.id) === Number(msg.item_id)
            ? {
                ...i,
                stock_quantity: Number(msg.stock_quantity),
                is_available: Boolean(msg.is_available)
              }
            : i
        )
      );
    } else if (msg.type === 'menu_item_updated' && msg.item) {
      if (msg.item.canteen_id && Number(msg.item.canteen_id) !== Number(activeCanteenId)) return;
      setMenuItems((prev) =>
        prev.map((i) =>
          Number(i.id) === Number(msg.item.id)
            ? { ...i, ...msg.item }
            : i
        )
      );
    } else if (msg.type === 'menu_item_created' && msg.item) {
      if (Number(msg.item.canteen_id) === Number(activeCanteenId)) {
        setMenuItems((prev) => {
          if (prev.some((it) => Number(it.id) === Number(msg.item.id))) return prev;
          return [...prev, msg.item];
        });
      }
    }
  }, [activeCanteenId]);
  useWebSocket(canteenWsEndpoint, handleCanteenWsMessage);

  // Extract unique categories for current canteen to offer dropdown suggestions
  const existingCategories = useMemo(() => {
    const cats = new Set();
    menuItems.forEach((i) => {
      if (i.category && i.category.trim()) cats.add(i.category.trim());
    });
    return Array.from(cats).sort();
  }, [menuItems]);

  // Quick Stock / Availability Update
  const handleUpdateStock = async (item, newStock, newAvailable = null) => {
    setUpdatingItemId(item.id);
    setSuccessMessage(null);
    try {
      const targetStock = Math.max(0, newStock);
      const targetAvail = targetStock === 0 ? false : (newAvailable !== null ? newAvailable : item.is_available);
      const updated = await updateMenuItemStock(
        item.id,
        targetStock,
        targetAvail
      );
      setMenuItems((prev) =>
        prev.map((i) => (Number(i.id) === Number(item.id) ? { ...i, ...updated } : i))
      );
      setSuccessMessage(`Stock updated for "${item.name}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      alert(`Error updating stock: ${err.message}`);
    } finally {
      setUpdatingItemId(null);
    }
  };

  // Open "Add New Food" Form
  const handleOpenAddModal = () => {
    setItemModalMode('add');
    setEditingItem(null);
    setFormName('');
    setFormPrice('');
    setFormCategory(existingCategories.length > 0 ? existingCategories[0] : 'Main Course');
    setFormDiet('veg');
    setFormStock('50');
    setFormAvailable(true);
    setFormNote('');
    setFormDescription('');
    setFormError(null);
  };

  // Open "Edit Food" Form
  const handleOpenEditModal = (item) => {
    setItemModalMode('edit');
    setEditingItem(item);
    setFormName(item.name || '');
    setFormPrice(String(item.price || ''));
    setFormCategory(item.category || '');
    // Determine diet
    const d = String(item.dietary_label || '').toLowerCase();
    const isNonVeg = d.includes('non');
    setFormDiet(isPureVegCanteen ? 'veg' : isNonVeg ? 'non-veg' : 'veg');
    setFormStock(String(item.stock_quantity ?? 0));
    setFormAvailable(item.is_available ?? true);
    setFormNote(item.note || '');
    setFormDescription(item.description || '');
    setFormError(null);
  };

  const handleCloseItemModal = () => {
    setItemModalMode(null);
    setEditingItem(null);
    setFormError(null);
  };

  // Submit Add or Edit Form
  const handleSaveItem = async (e) => {
    e.preventDefault();
    setFormError(null);

    // 1. Validations
    const cleanName = formName.trim();
    if (!cleanName || cleanName.length < 2) {
      setFormError('Food name must be at least 2 characters.');
      return;
    }

    const priceNum = parseFloat(formPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError('Please enter a valid price greater than 0.');
      return;
    }

    const cleanCat = formCategory.trim();
    if (!cleanCat || cleanCat.length < 2) {
      setFormError('Please select or enter a valid category (minimum 2 characters).');
      return;
    }

    const stockNum = parseInt(formStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setFormError('Stock quantity cannot be negative.');
      return;
    }

    const assignedDiet = isPureVegCanteen ? 'veg' : formDiet;

    setFormSubmitting(true);
    try {
      if (itemModalMode === 'add') {
        const payload = {
          name: cleanName,
          price: priceNum,
          category: cleanCat,
          dietary_label: assignedDiet,
          stock_quantity: stockNum,
          is_available: formAvailable && stockNum > 0,
          note: formNote.trim() || null,
          description: formDescription.trim() || null
        };
        const created = await createMenuItem(activeCanteenId, payload);
        setMenuItems((prev) => [...prev, created]);
        setSuccessMessage(`Successfully added "${cleanName}" to the menu!`);
        setItemModalMode(null);
        setTimeout(() => setSuccessMessage(null), 3500);
      } else if (itemModalMode === 'edit' && editingItem) {
        const payload = {
          name: cleanName,
          price: priceNum,
          category: cleanCat,
          dietary_label: assignedDiet,
          stock_quantity: stockNum,
          is_available: formAvailable,
          note: formNote.trim() || null,
          description: formDescription.trim() || null
        };
        const updated = await updateMenuItem(editingItem.id, payload);
        setMenuItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? { ...i, ...updated } : i))
        );
        setSuccessMessage(`Changes saved for "${cleanName}"!`);
        setItemModalMode(null);
        setEditingItem(null);
        setTimeout(() => setSuccessMessage(null), 3500);
      }
    } catch (err) {
      setFormError(err.message || 'Failed to save food item changes.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredItems = menuItems.filter((i) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (i.name || '').toLowerCase().includes(query) ||
      (i.category || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-title">
              <IconBoxes size={20} className="inline mr-2 text-accent" />
              Canteen Menu & Inventory Manager
            </h3>
            <span className="modal-sub">
              Add new dishes, edit prices & categories, adjust stock and toggle availability
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

        <div className="modal-body">
          {/* Outlet Selection (Restricted to Authorized Canteen) */}
          <div className="canteen-tabs-bar">
            {assignedCanteenId ? (
              <div className="canteen-tab canteen-tab-active canteen-tab-locked">
                <IconStore size={15} className="mr-1 text-accent inline" />
                <span>{activeCanteen?.name || `Canteen #${assignedCanteenId}`}</span>
                <span className="canteen-tab-lock-badge">
                  <IconLock size={12} className="inline mr-1" />
                  Assigned
                </span>
              </div>
            ) : (
              canteens.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCanteenId(c.id)}
                  className={`canteen-tab ${activeCanteenId === c.id ? 'canteen-tab-active' : ''}`}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>

          {/* Action Row: Search, Refresh and Add New Food Button */}
          <div className="menu-manager-action-row">
            <div className="stock-search-wrap flex-1">
              <IconSearch size={16} className="stock-search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dishes by name or category (e.g. Dosa, Rice, Pav Bhaji)..."
                className="stock-search-input"
              />
            </div>
            <button
              type="button"
              onClick={() => loadMenu(activeCanteenId)}
              className="btn-modal-refresh"
              title="Refresh menu & stock from server"
              disabled={loading}
            >
              <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="btn-add-food-primary"
              title="Add a brand new dish to this canteen menu"
            >
              <IconPlus size={16} className="mr-1 inline" />
              <span>Add New Food</span>
            </button>
          </div>

          {successMessage && (
            <div className="stock-success-toast">
              <IconCheck size={16} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Items Table */}
          {loading ? (
            <div className="loading-view py-8">
              <div className="loading-spinner" />
              <p className="loading-text">Loading menu items...</p>
            </div>
          ) : error ? (
            <div className="error-banner">
              <IconAlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : (
            <div className="stock-items-table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Dish / Category</th>
                    <th className="text-center">Diet</th>
                    <th className="text-right">Price</th>
                    <th className="text-center">Availability</th>
                    <th className="text-center">Stock</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-muted">
                        No food items found matching "{searchQuery}".
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isBusy = updatingItemId === item.id;
                      const dLabel = String(item.dietary_label || '').toLowerCase();
                      const isNonVeg = !isPureVegCanteen && (dLabel === 'non-veg' || dLabel === 'nonveg');

                      return (
                        <tr
                          key={item.id}
                          className={!item.is_available ? 'row-unavailable' : ''}
                        >
                          <td>
                            <div className="font-bold text-main">{item.name}</div>
                            <div className="text-xs text-muted">
                              {item.category}
                              {item.note ? ` • ${item.note}` : ''}
                            </div>
                          </td>
                          <td className="text-center">
                            {isNonVeg ? (
                              <span className="diet-pill-badge diet-pill-nonveg" title="Non-Vegetarian">
                                <IconNonVeg size={14} className="mr-1" /> Non-Veg
                              </span>
                            ) : (
                              <span className="diet-pill-badge diet-pill-veg" title="Vegetarian">
                                <IconVeg size={14} className="mr-1" /> Veg
                              </span>
                            )}
                          </td>
                          <td className="text-right font-semibold">₹{Math.round(item.price)}</td>
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const nextAvail = !item.is_available;
                                const nextStock = (nextAvail && item.stock_quantity === 0) ? 10 : item.stock_quantity;
                                handleUpdateStock(item, nextStock, nextAvail);
                              }}
                              disabled={isBusy}
                              className={`toggle-avail-pill ${
                                item.is_available
                                  ? 'avail-pill-active'
                                  : 'avail-pill-inactive'
                              }`}
                            >
                              {item.is_available ? '✓ In Stock' : '✕ Sold Out'}
                            </button>
                          </td>
                          <td className="text-center">
                            <div className="stock-stepper">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStock(item, Math.max(0, item.stock_quantity - 10))
                                }
                                disabled={isBusy || item.stock_quantity <= 0}
                                className="btn-step"
                                title="-10 stock"
                              >
                                -10
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStock(item, Math.max(0, item.stock_quantity - 1))
                                }
                                disabled={isBusy || item.stock_quantity <= 0}
                                className="btn-step"
                                title="-1 stock"
                              >
                                -1
                              </button>
                              <span className="stock-num-badge font-bold">
                                {isBusy ? <span className="spinner" /> : item.stock_quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStock(item, item.stock_quantity + 1, true)
                                }
                                disabled={isBusy}
                                className="btn-step"
                                title="+1 stock"
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStock(item, item.stock_quantity + 10, true)
                                }
                                disabled={isBusy}
                                className="btn-step"
                                title="+10 stock"
                              >
                                +10
                              </button>
                            </div>
                          </td>
                          <td className="text-right">
                            <div className="table-row-actions">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(item)}
                                className="btn-edit-dish"
                                title="Edit food name, price, category, and dietary label"
                              >
                                <IconEdit size={14} className="mr-1 inline" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStock(item, 50, true)}
                                disabled={isBusy}
                                className="btn-restock-50"
                                title="Reset stock to default 50"
                              >
                                Set 50
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-modal-close">
            Done
          </button>
        </div>
      </div>

      {/* SUB-MODAL: Add or Edit Menu Item Form */}
      {itemModalMode && (
        <div className="sub-modal-overlay" onClick={handleCloseItemModal}>
          <div
            className="sub-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="sub-modal-header">
              <h4 className="sub-modal-title">
                {itemModalMode === 'add' ? (
                  <>
                    <IconPlus size={18} className="mr-2 inline text-accent" />
                    Add New Food Item
                  </>
                ) : (
                  <>
                    <IconEdit size={18} className="mr-2 inline text-accent" />
                    Edit Food Item
                  </>
                )}
              </h4>
              <button
                type="button"
                onClick={handleCloseItemModal}
                className="sub-modal-close-btn"
                title="Cancel and close"
              >
                <IconX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="sub-modal-form">
              {formError && (
                <div className="error-banner mb-3">
                  <IconAlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Food Name */}
              <div className="form-field-group">
                <label className="form-field-label">
                  Food Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Paneer Butter Masala, Schezwan Noodles"
                  className="form-text-input"
                />
              </div>

              {/* Price & Category Grid */}
              <div className="form-field-grid-2">
                <div className="form-field-group">
                  <label className="form-field-label">
                    Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="e.g. 120"
                    className="form-text-input"
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="category-suggestions"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="Select or type category..."
                    className="form-text-input"
                  />
                  <datalist id="category-suggestions">
                    {existingCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Dietary Classification Selection */}
              <div className="form-field-group">
                <label className="form-field-label">
                  Dietary Classification <span className="text-red-500">*</span>
                </label>
                <div className="diet-selection-row">
                  <label
                    className={`diet-option-card ${
                      formDiet === 'veg' ? 'diet-option-selected-veg' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="itemDiet"
                      value="veg"
                      checked={formDiet === 'veg'}
                      onChange={() => setFormDiet('veg')}
                      className="sr-only"
                    />
                    <IconVeg size={18} className="mr-2" />
                    <span className="font-bold">Vegetarian (Veg)</span>
                  </label>

                  <label
                    className={`diet-option-card ${
                      isPureVegCanteen
                        ? 'diet-option-disabled'
                        : formDiet === 'non-veg'
                        ? 'diet-option-selected-nonveg'
                        : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="itemDiet"
                      value="non-veg"
                      checked={formDiet === 'non-veg'}
                      onChange={() => !isPureVegCanteen && setFormDiet('non-veg')}
                      disabled={isPureVegCanteen}
                      className="sr-only"
                    />
                    <IconNonVeg size={18} className="mr-2" />
                    <span className="font-bold">Non-Vegetarian</span>
                  </label>
                </div>
                {isPureVegCanteen && (
                  <p className="text-xs text-muted mt-1">
                    ℹ️ <strong>{activeCanteen?.name}</strong> is strictly Pure Vegetarian. Non-Veg classification is locked.
                  </p>
                )}
              </div>

              {/* Stock Quantity & Availability */}
              <div className="form-field-grid-2">
                <div className="form-field-group">
                  <label className="form-field-label">Stock Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    className="form-text-input"
                  />
                </div>

                <div className="form-field-group flex flex-col justify-end">
                  <label className="checkbox-toggle-label">
                    <input
                      type="checkbox"
                      checked={formAvailable}
                      onChange={(e) => setFormAvailable(e.target.checked)}
                      className="checkbox-input"
                    />
                    <span>Available for Ordering</span>
                  </label>
                </div>
              </div>

              {/* Note / Tagline */}
              <div className="form-field-group">
                <label className="form-field-label">Special Note (Optional)</label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="e.g. Served with green chutney, Extra spicy"
                  className="form-text-input"
                />
              </div>

              {/* Description */}
              <div className="form-field-group">
                <label className="form-field-label">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of dish ingredients or flavor..."
                  className="form-textarea-input"
                />
              </div>

              <div className="sub-modal-actions">
                <button
                  type="button"
                  onClick={handleCloseItemModal}
                  disabled={formSubmitting}
                  className="btn-form-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn-form-save"
                >
                  {formSubmitting ? (
                    'Saving...'
                  ) : itemModalMode === 'add' ? (
                    'Create Dish'
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
