import { NavLink } from "react-router-dom";

const links = [
  { to: "/",        icon: "▦", label: "Dashboard" },
  { to: "/devices", icon: "⬡", label: "Devices" },
  { to: "/backup",  icon: "↻", label: "Backup" },
];

export default function Navbar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        GIB Backup
        <span>Cisco Config System</span>
      </div>
      <nav>
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
    </aside>
  );
}
