import React from 'react';
import { IconSearch, IconX, IconRefresh } from './Icons';

export function OrderFilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
  onResetFilters,
  totalFilteredCount,
  totalOrdersCount
}) {
  const statuses = [
    { id: '', label: 'All Orders' },
    { id: 'PENDING', label: 'Pending' },
    { id: 'PREPARING', label: 'Preparing' },
    { id: 'READY', label: 'Ready' },
    { id: 'COLLECTED', label: 'Collected' },
    { id: 'CANCELLED', label: 'Cancelled' },
  ];

  const hasActiveFilters = searchQuery.trim() !== '' || statusFilter !== '';

  return (
    <div className="filter-bar-root">
      <div className="filter-bar-top">
        {/* Search Input */}
        <div className="search-box-wrap">
          <IconSearch size={18} className="search-box-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search orders by Token (O20), Student Name, or Phone..."
            className="filter-search-input"
            aria-label="Search orders"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="clear-search-btn"
              title="Clear search"
            >
              <IconX size={16} />
            </button>
          )}
        </div>

        {/* Sort Controls & Counter */}
        <div className="filter-controls-group">
          <label className="sort-label">
            <span>Sort:</span>
            <select
              value={sortOrder}
              onChange={(e) => onSortOrderChange(e.target.value)}
              className="sort-dropdown"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First (Queue Order)</option>
              <option value="token">Token Order</option>
            </select>
          </label>

          <span className="results-counter-pill">
            Showing <strong>{totalFilteredCount}</strong> of {totalOrdersCount}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="reset-filters-btn"
              title="Reset all search and status filters"
            >
              <IconX size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Segmented Tabs */}
      <div className="status-tabs-container">
        {statuses.map((s) => {
          const isActive = statusFilter === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onStatusFilterChange(s.id)}
              className={`status-tab-btn ${isActive ? 'status-tab-active' : ''}`}
            >
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
