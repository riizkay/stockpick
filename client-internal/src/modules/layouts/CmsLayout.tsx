import { Link, Outlet } from "react-router-dom";

export default function CmsLayout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        background: "#f8fafc",
      }}
    >
      <aside
        style={{
          padding: 24,
          borderRight: "1px solid #e2e8f0",
          background: "#ffffff",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Stock Agent CMS</div>
        <nav
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          <Link to="/dashboard" style={{ color: "#0f172a", textDecoration: "none" }}>
            Dashboard
          </Link>
          <Link to="/settings/users" style={{ color: "#0f172a", textDecoration: "none" }}>
            Users
          </Link>
          <Link to="/settings/roles" style={{ color: "#0f172a", textDecoration: "none" }}>
            Roles
          </Link>
        </nav>
      </aside>

      <main
        style={{
          padding: 24,
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
