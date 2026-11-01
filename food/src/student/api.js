/**
 * API Service for UniHub Student App
 * Configured via VITE_API_URL environment variable.
 */

const API_BASE_URL = (() => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    if ((window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port !== '') {
      return 'http://127.0.0.1:8000';
    }
  }
  return 'https://unihub-backend-574g.onrender.com';
})();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper to process API responses with automatic retries and friendly cold-start notices
 */
async function request(endpoint, options = {}, retries = 3, backoff = 1500) {
  const url = `${API_BASE_URL}${endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      // Free-tier PaaS (Render, Koyeb) returns 502/503/504 while container spins up
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        console.warn(`[UniHub API] Server is waking up (status ${response.status}). Retrying attempt ${attempt + 1}/${retries}...`);
        await wait(backoff * (attempt + 1));
        continue;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = data.detail || `Server returned error (${response.status})`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      const isNetworkError = error.name === 'TypeError' || (error.message && error.message.includes('fetch'));
      if (isNetworkError && attempt < retries) {
        console.warn(`[UniHub API] Server is waking up, retrying attempt ${attempt + 1}/${retries}...`);
        await wait(backoff * (attempt + 1));
        continue;
      }

      if (isNetworkError) {
        throw new Error('Server is waking up, retrying... If this takes longer than 30 seconds, please refresh.');
      }
      throw error;
    }
  }
}

/**
 * Fetch all active campus canteens
 */
export async function fetchCanteens() {
  return request('/canteens?active_only=true');
}

/**
 * Fetch menu items for a specific canteen with optional filters
 */
export async function fetchCanteenMenu(canteenId, { category = '', diet = '', availableOnly = false } = {}) {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (diet) params.append('diet', diet);
  if (availableOnly) params.append('available_only', 'true');

  const queryString = params.toString() ? `?${params.toString()}` : '';
  return request(`/canteens/${canteenId}/menu${queryString}`);
}

/**
 * Fetch add-ons available for a specific canteen
 */
export async function fetchCanteenAddons(canteenId) {
  return request(`/canteens/${canteenId}/addons`);
}

/**
 * Place a student pre-order
 */
export async function createOrder(orderPayload) {
  return request('/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload),
  });
}

/**
 * Fetch an order's status and receipt by order ID (public endpoint, PII-safe)
 */
export async function fetchOrderById(orderId) {
  return request(`/orders/public/${orderId}`);
}

/**
 * Cancel a pending order (student cancellation where permitted)
 */
export async function cancelOrder(orderId) {
  return request(`/orders/public/${orderId}/cancel`, {
    method: 'POST',
  });
}

/**
 * Lookup an order by daily token (e.g. "O5", "A1") with optional canteen and date scoping
 */
export async function fetchOrderByToken(dailyToken, canteenId = null, tokenDate = null) {
  const cleanToken = encodeURIComponent(dailyToken.trim().toUpperCase());
  const params = new URLSearchParams();
  if (canteenId) params.append('canteen_id', canteenId);
  if (tokenDate) params.append('date_str', tokenDate);
  const queryString = params.toString() ? `?${params.toString()}` : '';
  return request(`/orders/token/${cleanToken}${queryString}`);
}

/**
 * Resolves static image URLs served by the FastAPI backend
 */
export function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  const cleanPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${API_BASE_URL}${cleanPath}`;
}
