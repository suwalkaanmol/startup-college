import React from 'react';
import {
  IconReceipt,
  IconClock,
  IconChefHat,
  IconCheckCircle,
  IconCheck,
  IconBan
} from './Icons';

export function OrderStatsBar({
  orders = [],
  activeStatusFilter,
  onSelectStatusFilter
}) {
  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'PENDING').length,
    preparing: orders.filter((o) => o.status === 'PREPARING').length,
    ready: orders.filter((o) => o.status === 'READY').length,
    collected: orders.filter((o) => o.status === 'COLLECTED').length,
    cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
  };

  const statCards = [
    {
      id: 'ALL',
      label: 'All Orders',
      count: counts.all,
      icon: IconReceipt,
      colorClass: 'stat-all',
      badgeClass: 'badge-neutral',
    },
    {
      id: 'PENDING',
      label: 'New Pending',
      count: counts.pending,
      icon: IconClock,
      colorClass: 'stat-pending',
      badgeClass: 'badge-pending',
    },
    {
      id: 'PREPARING',
      label: 'In Kitchen',
      count: counts.preparing,
      icon: IconChefHat,
      colorClass: 'stat-preparing',
      badgeClass: 'badge-preparing',
    },
    {
      id: 'READY',
      label: 'Ready for Pickup',
      count: counts.ready,
      icon: IconCheckCircle,
      colorClass: 'stat-ready',
      badgeClass: 'badge-ready',
    },
    {
      id: 'COLLECTED',
      label: 'Collected',
      count: counts.collected,
      icon: IconCheck,
      colorClass: 'stat-collected',
      badgeClass: 'badge-collected',
    },
    {
      id: 'CANCELLED',
      label: 'Cancelled',
      count: counts.cancelled,
      icon: IconBan,
      colorClass: 'stat-cancelled',
      badgeClass: 'badge-cancelled',
    },
  ];

  return (
    <div className="stats-bar-grid">
      {statCards.map((item) => {
        const Icon = item.icon;
        const isSelected =
          activeStatusFilter === item.id || (!activeStatusFilter && item.id === 'ALL');

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectStatusFilter(item.id === 'ALL' ? '' : item.id)}
            className={`stat-tile ${item.colorClass} ${isSelected ? 'stat-tile-active' : ''}`}
          >
            <div className="stat-tile-top">
              <span className="stat-label">{item.label}</span>
              <Icon size={16} className="stat-icon" />
            </div>
            <div className="stat-tile-bottom">
              <span className="stat-count">{item.count}</span>
              {isSelected && <span className="stat-active-indicator">Active View</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
