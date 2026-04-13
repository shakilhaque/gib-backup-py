/**
 * Axios instance pre-configured with the API base URL.
 * In production (Docker) requests go through nginx → /api → backend.
 * In development the vite proxy rewrites /api → http://localhost:8000.
 */
import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 120_000, // 2 min – SSH backup runs can be slow
  headers: { "Content-Type": "application/json" },
});

// Global response interceptor – normalise error messages
client.interceptors.response.use(
  (res) => res,
  (err) => {
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
