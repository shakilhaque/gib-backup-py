/**
 * Axios instance pre-configured with the API base URL.
 * Automatically attaches the JWT token from localStorage.
 * On 401 → clears token and redirects to login.
 */
import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 120_000,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: attach JWT token ─────────────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("gib_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: normalise errors + handle 401 ──────────────────────
client.interceptors.response.use(
  (res) => res,
  (err) => {
    // On 401 (expired / invalid token) → force re-login
    if (err.response?.status === 401) {
      localStorage.removeItem("gib_token");
      localStorage.removeItem("gib_user");
      // Avoid redirect loop if already on login page
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }

    const detail = err.response?.data?.detail;
    if (detail) {
      err.message = Array.isArray(detail)
        ? detail.map((d) => d.msg).join("; ")
        : String(detail);
    }
    return Promise.reject(err);
  }
);

export default client;
