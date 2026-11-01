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
    if ((window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && window.location.port !== '') {
      return `ws://127.0.0.1:8000${cleanEndpoint}`;
    }
  }

  return `wss://unihub-backend-574g.onrender.com${cleanEndpoint}`;
}

/**
 * Custom React hook for robust WebSocket connection with auto-reconnect and heartbeat.
 *
 * @param {string|null} endpoint - e.g. "/ws/canteen/1" or "/ws/orders/25" (or null to disable)
 * @param {Function} onMessage - Callback receiving parsed JSON message
 * @returns {{ isConnected: boolean, send: Function }}
 */
export function useWebSocket(endpoint, onMessage) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!endpoint) return;

    const url = getWebSocketUrl(endpoint);
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptRef.current = 0;
        console.log(`[WS] Connected successfully to ${url}`);

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
          if (data.type === 'pong') return; // Ignore pong
          console.log(`[WS] Received ${data.type || 'message'} on ${endpoint}:`, data);
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (err) {
          console.warn('Failed to parse WS message:', err);
        }
      };

      ws.onerror = (err) => {
        console.warn(`[WS] Error on ${url}:`, err);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        console.log(`[WS] Closed connection to ${url} (code=${event.code}, reason=${event.reason || 'none'})`);
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

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
  }, [endpoint]);

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
