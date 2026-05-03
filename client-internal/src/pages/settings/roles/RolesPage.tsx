const roles = [
  {
    id: "role-admin",
    name: "admin",
    permissions: ["users.read", "users.write", "roles.read", "roles.write"],
  },
];

export default function RolesPage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Roles</div>
        <div style={{ color: "#475569" }}>Atur role dan permission untuk CMS internal.</div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        {roles.map((role) => (
          <div
            key={role.id}
            style={{
              background: "#ffffff",
              borderRadius: 20,
              border: "1px solid #e2e8f0",
              padding: 20,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{role.name}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {role.permissions.map((permission) => (
                <span
                  key={permission}
                  style={{
                    borderRadius: 999,
                    background: "#e2e8f0",
                    padding: "8px 12px",
                    fontSize: 14,
                  }}
                >
                  {permission}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
