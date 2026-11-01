/**
 * Theme Management Service for UniHub Canteen Owner App
 * Uses independent storage key 'unihub-owner-theme'
 */

export const OWNER_THEME_STORAGE_KEY = 'food_owner_theme';

/**
 * Detects the user's operating system preferred color scheme
 * @returns {'light' | 'dark'}
 */
export function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Retrieves the initial theme for the Owner App
 * Follows saved preference first, falls back to system preference
 * @returns {'light' | 'dark'}
 */
export function getInitialOwnerTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(OWNER_THEME_STORAGE_KEY) || localStorage.getItem('unihub-owner-theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch (e) {
    console.warn('Could not read owner theme from localStorage:', e);
  }
  return getSystemTheme();
}

/**
 * Applies the theme to the document root (<html data-theme="...">)
 * @param {'light' | 'dark'} theme 
 */
export function applyOwnerThemeToDocument(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#0f1220' : '#667eea');
  }
}

/**
 * Persists the user's manual theme selection
 * @param {'light' | 'dark'} theme 
 */
export function saveOwnerTheme(theme) {
  try {
    localStorage.setItem(OWNER_THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn('Could not save owner theme to localStorage:', e);
  }
}
