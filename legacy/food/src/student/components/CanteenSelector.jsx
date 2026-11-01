import React from 'react';
import { IconMapPin, IconStore, IconVeg } from './Icons';

export function CanteenSelector({
  canteens,
  activeCanteen,
  onSelectCanteen
}) {
  return (
    <div className="canteens-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Campus Canteens</h2>
          <p className="section-subtitle">Select an outlet to view fresh live menus & pre-order</p>
        </div>
        <span className="canteens-count-tag">{canteens.length} Outlets Open</span>
      </div>

      <div className="canteens-grid">
        {canteens.map((canteen) => {
          const isSelected = activeCanteen && activeCanteen.id === canteen.id;

          return (
            <div
              key={canteen.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Select ${canteen.name}${canteen.is_pure_veg ? ', Pure Veg' : ''}`}
              onClick={() => onSelectCanteen(canteen)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCanteen(canteen);
                }
              }}
              className={`canteen-card ${isSelected ? 'canteen-card-active' : ''}`}
            >
              <div className="canteen-card-top">
                <div className="canteen-icon-wrap">
                  <IconStore className="w-5 h-5 text-orange-600" />
                </div>
                <div className="canteen-badges">
                  {canteen.is_pure_veg && (
                    <span className="badge-pure-veg">
                      <IconVeg className="w-3 h-3" /> Pure Veg
                    </span>
                  )}
                  {canteen.canteen_type && (
                    <span className="badge-type">{canteen.canteen_type}</span>
                  )}
                  {canteen.gst_percent && (
                    <span className="badge-gst">+{canteen.gst_percent}% GST</span>
                  )}
                </div>
              </div>

              <div className="canteen-card-body">
                <h3 className="canteen-name">{canteen.name}</h3>
                {canteen.tagline && (
                  <p className="canteen-tagline">{canteen.tagline}</p>
                )}
                
                <div className="canteen-meta-row">
                  <span className="canteen-meta-item">
                    <IconMapPin className="w-3.5 h-3.5 text-gray-400" />
                    {canteen.location}
                  </span>
                </div>
              </div>

              <div className="canteen-card-footer">
                {isSelected ? (
                  <span className="active-tag">✓ Active Canteen</span>
                ) : (
                  <span className="select-prompt">View Menu →</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
