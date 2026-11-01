import React from 'react';

/**
 * Common base SVG helper ensuring strict pixel boundaries
 * Prevents any SVG distortion, accidental expansion, or stray rings
 */
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
        ...style,
      }}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconStore({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </SvgIcon>
  );
}

export function IconReceipt({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </SvgIcon>
  );
}

export function IconSun({ size = 20, className = '', style = {}, ...props }) {
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

export function IconMoon({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
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

export function IconCheck({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <polyline points="20 6 9 17 4 12" />
    </SvgIcon>
  );
}

export function IconCheckCircle({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </SvgIcon>
  );
}

export function IconClock({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </SvgIcon>
  );
}

export function IconX({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </SvgIcon>
  );
}

export function IconRefresh({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </SvgIcon>
  );
}

export function IconAlertCircle({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </SvgIcon>
  );
}

export function IconChefHat({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
      <line x1="6" y1="17" x2="18" y2="17" />
    </SvgIcon>
  );
}

export function IconPackage({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </SvgIcon>
  );
}

export function IconUser({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </SvgIcon>
  );
}

export function IconPhone({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </SvgIcon>
  );
}

export function IconArrowRight({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </SvgIcon>
  );
}

export function IconBan({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </SvgIcon>
  );
}

export function IconBoxes({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l6 3.43a2 2 0 0 0 2.06 0l6-3.43a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71l-6-3.43a2 2 0 0 0-2.06 0l-6 3.43z" />
      <path d="M12 12v9.5" />
      <path d="M14.97 2.92A2 2 0 0 0 14 4.63v3.24a2 2 0 0 0 .97 1.71l6 3.43a2 2 0 0 0 2.06 0l6-3.43a2 2 0 0 0 .97-1.71V4.63a2 2 0 0 0-.97-1.71l-6-3.43a2 2 0 0 0-2.06 0l-6 3.43z" />
    </SvgIcon>
  );
}

export function IconPlus({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </SvgIcon>
  );
}

export function IconEdit({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </SvgIcon>
  );
}

export function IconVeg({ size = 16, className = '', style = {}, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      role="img"
      aria-label="Vegetarian"
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="4" stroke="#16a34a" strokeWidth="2.5" fill="#f0fdf4" />
      <circle cx="12" cy="12" r="5" fill="#16a34a" />
    </svg>
  );
}

export function IconNonVeg({ size = 16, className = '', style = {}, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      role="img"
      aria-label="Non-Vegetarian"
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="4" stroke="#dc2626" strokeWidth="2.5" fill="#fef2f2" />
      <polygon points="12,6 18,17 6,17" fill="#dc2626" />
    </svg>
  );
}

export function IconLock({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </SvgIcon>
  );
}

export function IconLogout({ size = 20, className = '', style = {}, ...props }) {
  return (
    <SvgIcon size={size} className={className} style={style} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </SvgIcon>
  );
}
