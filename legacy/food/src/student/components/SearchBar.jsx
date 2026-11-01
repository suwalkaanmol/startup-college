import React from 'react';
import { IconSearch, IconX } from './Icons';

export function SearchBar({
  value,
  onChange,
  onClear,
  canteenName
}) {
  return (
    <div className="search-bar-wrap">
      <div className="search-bar-container">
        <IconSearch size={20} className="search-icon w-5 h-5" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            canteenName
              ? `Search dishes in ${canteenName} (e.g. Fried Rice, Noodles, Maggi, Dosa)...`
              : 'Search dishes by name...'
          }
          className="search-bar-input"
          aria-label="Search dishes"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="clear-search-btn"
            title="Clear search query"
            aria-label="Clear search"
          >
            <IconX size={16} className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
