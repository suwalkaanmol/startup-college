import React from 'react';
import { IconVeg, IconNonVeg, IconX } from './Icons';

export function FilterBar({
  dietFilter,
  onDietFilterChange,
  inStockOnly,
  onInStockToggle,
  filteredCount,
  isPureVegCanteen,
  selectedCategory,
  searchQuery,
  onResetAllFilters
}) {
  const hasActiveFilters = Boolean(searchQuery || selectedCategory || dietFilter || inStockOnly);

  return (
    <div className="filter-bar-root">
      <div className="filters-group">
        {/* Dietary Filters (only if outlet is not strictly pure veg) */}
        {!isPureVegCanteen && (
          <div className="diet-pill-group">
            <button
              type="button"
              onClick={() => onDietFilterChange('')}
              className={`diet-btn ${dietFilter === '' ? 'diet-btn-active' : ''}`}
            >
              All Diets
            </button>
            <button
              type="button"
              onClick={() => onDietFilterChange('veg')}
              className={`diet-btn ${dietFilter === 'veg' ? 'diet-btn-veg-active' : ''}`}
            >
              <IconVeg className="w-3.5 h-3.5 mr-1" /> Veg
            </button>
            <button
              type="button"
              onClick={() => onDietFilterChange('non-veg')}
              className={`diet-btn ${dietFilter === 'non-veg' ? 'diet-btn-nonveg-active' : ''}`}
            >
              <IconNonVeg className="w-3.5 h-3.5 mr-1" /> Non-Veg
            </button>
          </div>
        )}

        {/* In-Stock Toggle */}
        <label className="instock-toggle">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => onInStockToggle(e.target.checked)}
            className="toggle-checkbox"
          />
          <span className="toggle-label">In Stock Only</span>
        </label>
      </div>

      <div className="filter-meta-group">
        {/* Active filter summary pill */}
        {selectedCategory && (
          <span className="active-cat-indicator">
            Category: <strong>{selectedCategory}</strong>
          </span>
        )}

        {/* Count result badge */}
        <span className="filter-count-badge">
          {filteredCount} {filteredCount === 1 ? 'dish' : 'dishes'}
        </span>

        {/* Quick Reset All button if filters applied */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetAllFilters}
            className="btn-quick-reset"
            title="Reset category, search and dietary filters"
          >
            <IconX className="w-3 h-3 mr-1 inline" /> Reset Filters
          </button>
        )}
      </div>
    </div>
  );
}
