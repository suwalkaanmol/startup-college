import axios from "axios"; import { io } from "socket.io-client";
// Backend URL: set in ./config.js (editable after build) or VITE_API_URL at build time. Empty = local dev (Vite proxy).
const CFG = (typeof window !== "undefined" && window.TRAVEL_CONFIG) || {};
export const BASE = String(CFG.API_URL || import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const api = axios.create({ baseURL: BASE + "/api" });
api.interceptors.request.use(c => { const t = localStorage.getItem("travel_token"); if (t) c.headers.Authorization = "Bearer " + t; return c; });
api.interceptors.response.use(r => r, e => { if (e.response?.status === 401 && e.config?.url !== "/me") { localStorage.removeItem("travel_token"); localStorage.removeItem("travel_user"); location.reload(); } return Promise.reject(e); });
let sock;
export const getSocket = () => sock || (sock = io(BASE || undefined, { auth: cb => cb({ token: localStorage.getItem("travel_token") }), transports: ["websocket"] }));
export const disconnectSocket = () => { sock?.disconnect(); sock = null; };
