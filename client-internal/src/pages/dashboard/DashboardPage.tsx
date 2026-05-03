export default function DashboardPage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 8 }}>Dashboard</div>
        <div style={{ color: "#475569" }}>Ringkasan cepat untuk stok, user, dan aktivitas terbaru.</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {[
          { label: "Low stock", value: "3 item" },
          { label: "Internal users", value: "8 user" },
          { label: "Percakapan hari ini", value: "24 thread" },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              borderRadius: 20,
              padding: 20,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ color: "#64748b", marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
