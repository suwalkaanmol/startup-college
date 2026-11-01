import React from 'react';

// Common base helper for rendering SVGs with guaranteed dimensions
function SvgIcon({
  size = 20,
  className = '',
  style = {},
  children,
  viewBox = '0 0 24 24',
  strokeWidth = 2,
  ...props
}) {
  const pixelSize = `${size}px`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{
        width: pixelSize,
        height: pixelSize,
        minWidth: pixelSize,
        minHeight: pixelSize,
        maxWidth: pixelSize,
        maxHeight: pixelSize,
        flexShrink: 0,
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style
      }}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconShoppingBag({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </SvgIcon>
  );
}

export function IconSearch({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </SvgIcon>
  );
}

export function IconUtensils({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
      <path d="M15 2v19" />
      <path d="M5 2v19" />
      <path d="M9 2a3 3 0 0 1-3 3 3 3 0 0 1-3-3" />
    </SvgIcon>
  );
}

export function IconVeg({ size = 16, className = '', style = {}, ...props }) {
  const pixelSize = `${size}px`;
  const dotSize = `${Math.round(size * 0.45)}px`;
  return (
    <span
      role="img"
      aria-label="Vegetarian"
      className={`icon-veg-symbol ${className}`}
      title="Vegetarian"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: pixelSize,
        height: pixelSize,
        minWidth: pixelSize,
        minHeight: pixelSize,
        maxWidth: pixelSize,
        maxHeight: pixelSize,
        border: '1.5px solid #16a34a',
        borderRadius: '3px',
        backgroundColor: '#ffffff',
        padding: '2px',
        boxSizing: 'border-box',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style
      }}
      {...props}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: '#16a34a',
          display: 'block'
        }}
      />
    </span>
  );
}

export function IconNonVeg({ size = 16, className = '', style = {}, ...props }) {
  const pixelSize = `${size}px`;
  const triangleWidth = Math.round(size * 0.5);
  const triangleHeight = Math.round(size * 0.45);
  return (
    <span
      role="img"
      aria-label="Non-Vegetarian"
      className={`icon-nonveg-symbol ${className}`}
      title="Non-Vegetarian"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: pixelSize,
        height: pixelSize,
        minWidth: pixelSize,
        minHeight: pixelSize,
        maxWidth: pixelSize,
        maxHeight: pixelSize,
        border: '1.5px solid #b91c1c',
        borderRadius: '3px',
        backgroundColor: '#ffffff',
        padding: '2px',
        boxSizing: 'border-box',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style
      }}
      {...props}
    >
      <span
        style={{
          width: 0,
          height: 0,
          borderLeft: `${Math.round(triangleWidth / 2)}px solid transparent`,
          borderRight: `${Math.round(triangleWidth / 2)}px solid transparent`,
          borderBottom: `${triangleHeight}px solid #b91c1c`,
          display: 'block'
        }}
      />
    </span>
  );
}

export function IconClock({ size = 16, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </SvgIcon>
  );
}

export function IconMapPin({ size = 16, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </SvgIcon>
  );
}

export function IconCheck({ size = 20, className = '', strokeWidth = 2.5, style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} strokeWidth={strokeWidth} style={style} {...props}>
      <polyline points="20 6 9 17 4 12" />
    </SvgIcon>
  );
}

export function IconX({ size = 18, className = '', strokeWidth = 2, style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} strokeWidth={strokeWidth} style={style} {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </SvgIcon>
  );
}

export function IconRefresh({ size = 16, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </SvgIcon>
  );
}

export function IconAlertTriangle({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </SvgIcon>
  );
}

export function IconPlus({ size = 16, className = '', strokeWidth = 2.5, style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} strokeWidth={strokeWidth} style={style} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </SvgIcon>
  );
}

export function IconMinus({ size = 16, className = '', strokeWidth = 2.5, style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} strokeWidth={strokeWidth} style={style} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </SvgIcon>
  );
}

export function IconReceipt({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-8" />
      <path d="M16 12h-8" />
      <path d="M10 16h-2" />
    </SvgIcon>
  );
}

export function IconArrowRight({ size = 16, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </SvgIcon>
  );
}

export function IconChevronRight({ size = 16, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <polyline points="9 18 15 12 9 6" />
    </SvgIcon>
  );
}

export function IconStore({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20" />
    </SvgIcon>
  );
}

export function IconSun({ size = 18, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </SvgIcon>
  );
}

export function IconMoon({ size = 18, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </SvgIcon>
  );
}
