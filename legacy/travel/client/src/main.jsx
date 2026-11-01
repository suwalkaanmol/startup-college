import React from "react"; import { createRoot } from "react-dom/client"; import App from "./App.jsx"; import "./index.css"; import { BASE } from "./api";
// The main app opens this one with #token=<signed token>; keep it, then clear it from the address bar.
const tk = new URLSearchParams(location.hash.slice(1)).get("token") || new URLSearchParams(location.search).get("token");
if (tk) { localStorage.setItem("travel_token", tk); localStorage.removeItem("travel_user"); history.replaceState(null, "", location.pathname); }
fetch(BASE + "/api/health").catch(() => {}); // wake the free server while the page loads
createRoot(document.getElementById("root")).render(<App />);
