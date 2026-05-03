const users = [
  {
    id: "internal-user-1",
    fullName: "Admin Stock Agent",
    email: "admin@stock-agent.local",
    role: "admin",
  },
];

export default function UsersPage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Users</div>
        <div style={{ color: "#475569" }}>Kelola akun internal yang boleh masuk ke CMS.</div>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: 20,
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        {users.map((user) => (
          <div
            key={user.id}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 2fr 1fr",
              gap: 16,
              padding: 18,
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <div>{user.fullName}</div>
            <div>{user.email}</div>
            <div>{user.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
