import { NavLink } from "react-router-dom";
import gibLogo from "../assets/gib-logo.png";

export default function Navbar({ user, onLogout }) {
  const isAdmin = user?.role === "admin";

  const links = [
    { to: "/",        icon: "▦",  label: "Dashboard" },
    { to: "/devices", icon: "⬡",  label: "Devices" },
    { to: "/backup",  icon: "↻",  label: "Backup" },
    ...(isAdmin ? [{ to: "/users", icon: "👥", label: "Users" }] : []),
  ];

  return (
    <aside
      className="sidebar"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* ── Brand / Logo ── */}
      <div
        className="sidebar-brand"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "20px 16px 16px",
        }}
      >
        <img src={gibLogo} alt="GIB Logo" style={{ width: 90 }} />
        <span
          style={{
            fontSize: 14, fontWeight: 800, letterSpacing: "-0.3px",
            color: "var(--primary)", textAlign: "center", lineHeight: 1.2,
          }}
        >
          GIB Backup System
        </span>
      </div>

      {/* ── Nav links (takes all remaining space) ── */}
      <nav style={{ flex: 1, overflowY: "auto" }}>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            <span className="nav-icon">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>

      {/* ── User info ── */}
      {user && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "14px 16px 6px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: isAdmin ? "rgba(239,68,68,.2)" : "rgba(99,102,241,.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, flexShrink: 0,
              }}
            >
              {isAdmin ? "👑" : "🔧"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13, fontWeight: 600, color: "var(--text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {user.full_name || user.username}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {isAdmin ? "Administrator" : "IT Staff"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sign Out button (separate block, always at bottom) ── */}
      {user && (
        <div style={{ padding: "8px 16px 16px", flexShrink: 0 }}>
          <button
            onClick={onLogout}
            className="btn btn-ghost btn-sm"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            ⎋ Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
