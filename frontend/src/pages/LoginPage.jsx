import { useState } from "react";
import { login } from "../api/auth";
import gibLogo from "../assets/gib-logo.png";

export default function LoginPage({ onLogin }) {
  const [form,    setForm]    = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await login(form.username, form.password);
      localStorage.setItem("gib_token", data.access_token);
      localStorage.setItem("gib_user",  JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg)",
    }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "0 20px" }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src={gibLogo}
            alt="GIB Logo"
            style={{ width: 140, marginBottom: 16, display: "block", margin: "0 auto 16px" }}
          />
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--primary)", letterSpacing: "-0.5px" }}>
            GIB Backup System
          </div>
        </div>

        {/* Card */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, textAlign: "center" }}>Sign In</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24, textAlign: "center" }}>
            Enter your credentials to access the system
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-control"
                placeholder="Username"
                value={form.username}
                onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
                autoFocus
                required
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-control"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginTop: 8, padding: "10px 0", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}
            >
              {loading
                ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Signing in…</>
                : "Sign In"
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
