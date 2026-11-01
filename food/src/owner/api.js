/**
 * API Service for UniHub Canteen Owner / Kitchen Dashboard
 * Configured via VITE_API_URL environment variable.
 */

const API_BASE_URL = (() => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    if ((window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port === '5173') {
      return 'http://127.0.0.1:8000';
    }
  }
  return 'https://unihub-backend-574g.onrender.com';
})();

export const OWNER_TOKEN_KEY = 'food_owner_auth_token';
export const OWNER_USER_KEY = 'food_owner_user';

export function getAuthToken() {
  try {
    return localStorage.getItem(OWNER_TOKEN_KEY) || localStorage.getItem('unihub_owner_auth_token');
  } catch {
    return null;
  }
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(OWNER_USER_KEY) || localStorage.getItem('unihub_owner_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuthSession(token, user) {
  try {
    localStorage.setItem(OWNER_TOKEN_KEY, token);
    localStorage.setItem(OWNER_USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to store auth session:', err);
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(OWNER_TOKEN_KEY);
    localStorage.removeItem(OWNER_USER_KEY);
    localStorage.removeItem('unihub_owner_auth_token');
    localStorage.removeItem('unihub_owner_user');
  } catch (err) {
    console.error('Failed to clear auth session:', err);
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Standard fetch wrapper with automatic retries, cold-start handling, and Bearer auth injection
 */
async function request(endpoint, options = {}, retries = 3, backoff = 1500) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Free-tier PaaS (Render, Koyeb) returns 502/503/504 while spinning up
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        console.warn(`[UniHub API] Server is waking up (status ${response.status}). Retrying attempt ${attempt + 1}/${retries}...`);
        await wait(backoff * (attempt + 1));
        continue;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          clearAuthSession();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('unihub-auth-expired'));
          }
        }
        const errorMessage = data.detail || `Server returned error (${response.status})`;
        const error = new Error(errorMessage);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      if (error.status) {
        // HTTP error response from server (e.g. 400, 401, 404), do not retry
        throw error;
      }

      const isNetworkError = error.name === 'TypeError' || (error.message && error.message.includes('fetch'));
      if (isNetworkError && attempt < retries) {
        console.warn(`[UniHub API] Server is waking up, retrying attempt ${attempt + 1}/${retries}...`);
        await wait(backoff * (attempt + 1));
        continue;
      }

      if (isNetworkError) {
        throw new Error(
          'Server is waking up, retrying... If this takes longer than 30 seconds, please refresh.'
        );
      }
      throw error;
    }
  }
}

/**
 * Authenticate owner with username and password
 */
export async function loginOwner(username, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (data.access_token && data.owner) {
    setAuthSession(data.access_token, data.owner);
  }
  return data;
}

/**
 * Fetch authenticated owner profile
 */
export async function fetchCurrentOwnerProfile() {
  return request('/auth/me');
}

/**
 * Change authenticated owner password
 */
export async function changeOwnerPassword(oldPassword, newPassword) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

/**
 * Fetch system root info (current IST time, today's token letter, server status)
 */
export async function fetchSystemInfo() {
  return request('/');
}

/**
 * Fetch all active campus canteens
 */
export async function fetchCanteens() {
  return request('/canteens?active_only=true');
}

/**
 * Retrieve orders queue for the owner dashboard with optional filters
 * @param {Object} options
 * @param {number|null} options.canteenId
 * @param {string|null} options.status - 'PENDING' | 'PREPARING' | 'READY' | 'COLLECTED' | 'CANCELLED'
 * @param {string|null} options.tokenDate - 'YYYY-MM-DD'
 * @param {number} options.limit - Default 100
 */
export async function fetchOrders({ canteenId = null, status = null, tokenDate = null, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (canteenId !== null && canteenId !== undefined && canteenId !== '') {
    params.append('canteen_id', canteenId);
  }
  if (status && status !== 'ALL') {
    params.append('status', status.toUpperCase());
  }
  if (tokenDate) {
    params.append('token_date', tokenDate);
  }
  if (limit) {
    params.append('limit', limit);
  }

  const queryString = params.toString() ? `?${params.toString()}` : '';
  return request(`/orders${queryString}`);
}

/**
 * Fetch a single order by ID
 */
export async function fetchOrderById(orderId) {
  return request(`/orders/${orderId}`);
}

/**
 * Update an order's status
 * Supported statuses: PENDING -> PREPARING -> READY -> COLLECTED (or CANCELLED)
 * - Marking COLLECTED automatically marks payment as PAID
 * - Marking CANCELLED restores menu item inventory stock safely in the database
 */
export async function updateOrderStatus(orderId, newStatus) {
  return request(`/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus.toUpperCase() }),
  });
}

/**
 * Verifies a student's daily token at the pickup counter and marks order COLLECTED
 * @param {string} token - e.g. "O20", "A1"
 * @param {number|null} canteenId - Optional filter to verify against current canteen
 * @returns {Promise<{ success: boolean, message: string, order: Object }>}
 */
export async function verifyTokenAndCollect(token, canteenId = null) {
  const payload = {
    token: token.trim().toUpperCase(),
  };
  if (canteenId !== null && canteenId !== undefined && canteenId !== '') {
    payload.canteen_id = Number(canteenId);
  }

  return request('/orders/verify-token', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch menu items for a specific canteen (for menu & stock management)
 */
export async function fetchCanteenMenu(canteenId) {
  return request(`/canteens/${canteenId}/menu`);
}

/**
 * Create a new menu item for a specific canteen
 */
export async function createMenuItem(canteenId, itemData) {
  return request(`/canteens/${canteenId}/menu`, {
    method: 'POST',
    body: JSON.stringify(itemData),
  });
}

/**
 * Update an existing menu item's details (name, price, category, diet, etc.)
 */
export async function updateMenuItem(itemId, updateData) {
  return request(`/menu/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(updateData),
  });
}

/**
 * Update an item's stock quantity and/or availability
 */
export async function updateMenuItemStock(itemId, stockQuantity, isAvailable = null) {
  const payload = { stock_quantity: stockQuantity };
  if (isAvailable !== null) {
    payload.is_available = isAvailable;
  }
  return request(`/menu/${itemId}/stock`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
