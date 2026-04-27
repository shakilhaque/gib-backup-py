import { NavLink } from "react-router-dom";

export default function Navbar({ user, onLogout }) {
  const isAdmin = user?.role === "admin";

  const links = [
    { to: "/",        icon: "▦",  label: "Dashboard" },
    { to: "/devices", icon: "⬡",  label: "Devices" },
    { to: "/backup",  icon: "↻",  label: "Backup" },
    ...(isAdmin ? [{ to: "/users", icon: "👥", label: "Users" }] : []),
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        GIB Backup
        <span>Cisco Config System</span>
      </div>

      <nav style={{ flex: 1 }}>
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

      {/* ── User info + Logout ── */}
      {user && (
        <div style={{
          padding: "14px 16px",
          borderTop: "1px solid var(--border)",
          marginTop: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: isAdmin ? "rgba(239,68,68,.2)" : "rgba(99,102,241,.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>
              {isAdmin ? "👑" : "🔧"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.full_name || user.username}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                {isAdmin ? "Administrator" : "IT Staff"}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
          >
            ⎋ Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
