import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import DeviceManagement from "./pages/DeviceManagement";
import BackupPage from "./pages/BackupPage";
import UsersPage from "./pages/UsersPage";
import LoginPage from "./pages/LoginPage";
import Spinner from "./components/Spinner";
import { getMe } from "./api/auth";

export default function App() {
  const [user,    setUser]    = useState(null);   // logged-in user object
  const [checking, setChecking] = useState(true); // verifying stored token on mount

  // On mount: check if a valid token is already stored
  useEffect(() => {
    const token = localStorage.getItem("gib_token");
    if (!token) {
      setChecking(false);
      return;
    }
    // Verify token is still valid by calling /auth/me
    getMe()
      .then((u) => {
        localStorage.setItem("gib_user", JSON.stringify(u));
        setUser(u);
      })
      .catch(() => {
        localStorage.removeItem("gib_token");
        localStorage.removeItem("gib_user");
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (u) => setUser(u);

  const handleLogout = () => {
    localStorage.removeItem("gib_token");
    localStorage.removeItem("gib_user");
    setUser(null);
  };

  // Still verifying stored token
  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <Spinner text="Loading…" />
      </div>
    );
  }

  // Not logged in → show login page
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Logged in → show full app
  return (
    <div className="layout">
      <Navbar user={user} onLogout={handleLogout} />
      <main className="main-content">
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/devices" element={<DeviceManagement />} />
          <Route path="/backup"  element={<BackupPage />} />
          {/* Users page: admin only */}
          <Route
            path="/users"
            element={
              user.role === "admin"
                ? <UsersPage currentUser={user} />
                : <Navigate to="/" replace />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
