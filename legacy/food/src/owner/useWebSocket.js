import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Derives the WebSocket URL based on environment or window location.
 * Uses ws:// locally and wss:// over HTTPS.
 * Resolves to 127.0.0.1 to avoid Windows IPv6 [::1] loopback connection drops.
 */
export function getWebSocketUrl(endpoint) {
  const envWs = import.meta.env.VITE_WS_URL;
  if (envWs) {
    const cleanBase = envWs.replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanEndpoint}`;
  }

  const envApi = import.meta.env.VITE_API_URL;
  if (envApi) {
    const cleanBase = envApi.replace(/\/$/, '').replace(/^http/, 'ws');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanEndpoint}`;
  }

  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (typeof window !== 'undefined') {
    if ((window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port === '5173') {
      return `ws://127.0.0.1:8000${cleanEndpoint}`;
    }
  }

  return `wss://unihub-backend-574g.onrender.com${cleanEndpoint}`;
}

/**
 * Custom React hook for robust WebSocket connection with auto-reconnect,
 * heartbeat, and secure in-band token authentication.
 *
 * @param {string|null} endpoint - e.g. "/ws/owner" or "/ws/canteen/1" (or null to disable)
 * @param {Function} onMessage - Callback receiving parsed JSON message
 * @param {string|null} authToken - Optional Bearer JWT for authenticated endpoints (sent in-band, never in URL)
 * @returns {{ isConnected: boolean, send: Function }}
 */
export function useWebSocket(endpoint, onMessage, authToken = null) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const authTokenRef = useRef(authToken);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  const connect = useCallback(() => {
    if (!endpoint) return;

    const url = getWebSocketUrl(endpoint);
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;

        // If authenticated endpoint, send in-band authentication frame before marking connected
        if (authTokenRef.current) {
          try {
            ws.send(JSON.stringify({ type: 'authenticate', token: authTokenRef.current }));
          } catch (e) {
            console.warn('Failed to send WS authentication frame:', e);
          }
        } else {
          // Unauthenticated endpoints (e.g. /ws/canteen/:id) are connected immediately
          setIsConnected(true);
        }

        // Start ping heartbeat every 25s
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch (e) {
              // Ignore ping error
            }
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // In-band authentication acknowledgment from backend
          if (data.type === 'authenticated') {
            setIsConnected(true);
            reconnectAttemptRef.current = 0;
            return;
          }
          if (data.type === 'pong') return; // Ignore heartbeat pong
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (err) {
          console.warn('Failed to parse WS message:', err);
        }
      };

      ws.onerror = () => {
        // Handled in onclose
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

        // Do not auto-reconnect if authentication was rejected by backend (4401)
        if (event && event.code === 4401) {
          console.warn('Owner WebSocket connection rejected: Invalid or expired authentication token (4401).');
          return;
        }

        // Exponential backoff reconnect: 1s, 2s, 4s, 8s (max 10s)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
        reconnectAttemptRef.current += 1;

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (err) {
      console.warn('WebSocket connection attempt failed:', err);
      setIsConnected(false);
    }
  }, [endpoint, authToken]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  return { isConnected, send };
}
