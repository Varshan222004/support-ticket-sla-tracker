import { NavLink, useNavigate } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

function NavIcon({ children }: { children: ReactNode }): ReactElement {
  return <span style={{ fontSize: "1rem", lineHeight: 1 }}>{children}</span>;
}

export function Sidebar(): ReactElement {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAgent = user?.role === "AGENT";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const initials = user?.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-name">🎫 SLA Tracker</div>
        <div className="sidebar-brand-sub">Support Dashboard</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>

        {isAgent && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <NavIcon>📊</NavIcon>
            <span>Dashboard</span>
          </NavLink>
        )}

        <NavLink
          to="/tickets"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          <NavIcon>🎫</NavIcon>
          <span>{isAgent ? "All Tickets" : "My Tickets"}</span>
        </NavLink>

        <NavLink
          to="/tickets/new"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          <NavIcon>➕</NavIcon>
          <span>Create Ticket</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{initials}</div>
          <div>
            <div className="user-name">{user?.name}</div>
            <span className={`user-role-badge ${isAgent ? "agent" : "reporter"}`}>
              {user?.role}
            </span>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          <span>🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-context">
            <span className="topbar-kicker">Support workspace</span>
            <span className="topbar-title">Manage every customer request with confidence</span>
          </div>
          <div className="topbar-user">
            <span className="topbar-presence" aria-hidden="true" />
            <span>{user?.role === "AGENT" ? "Agent workspace" : "Reporter workspace"}</span>
          </div>
        </header>
        <main className="content-frame">{children}</main>
      </div>
    </div>
  );
}
