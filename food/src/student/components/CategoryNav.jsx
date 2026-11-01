import React from 'react';

export function CategoryNav({
  categories,
  selectedCategory,
  onSelectCategory,
  totalItemsCount
}) {
  if (!categories || categories.length === 0) return null;

  const isAllActive = !selectedCategory || selectedCategory.trim() === '';

  return (
    <div className="category-nav-wrap">
      <div className="category-scroll-container" role="tablist" aria-label="Food Categories">
        {/* All Items Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelectCategory('');
          }}
          className={`category-pill ${isAllActive ? 'category-pill-active' : ''}`}
          role="tab"
          aria-selected={isAllActive}
          data-category="all"
        >
          <span>All Items</span>
          <span className="pill-count">{totalItemsCount}</span>
        </button>

        {/* Dynamic Category Buttons */}
        {categories.map((cat) => {
          const isActive =
            !isAllActive &&
            selectedCategory.trim().toLowerCase() === cat.name.trim().toLowerCase();

          return (
            <button
              type="button"
              key={cat.name}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectCategory(cat.name);
              }}
              className={`category-pill ${isActive ? 'category-pill-active' : ''}`}
              role="tab"
              aria-selected={isActive}
              data-category={cat.name}
            >
              <span>{cat.name}</span>
              <span className="pill-count">{cat.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
