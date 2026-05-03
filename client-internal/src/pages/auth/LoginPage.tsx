import { useNavigate } from "react-router-dom";
import Button from "../../modules/components/Button";
import { useAuth } from "../../modules/context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginDemo } = useAuth();

  const handleLogin = () => {
    loginDemo();
    navigate("/dashboard");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#e2e8f0",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          borderRadius: 24,
          padding: 28,
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 12 }}>CMS Internal</div>
        <div style={{ color: "#475569", lineHeight: 1.6, marginBottom: 24 }}>
          Login internal untuk kelola user, role, permission, dan master data stok.
        </div>
        <Button label="Masuk ke CMS" onClick={handleLogin} style={{ width: "100%" }} />
      </div>
    </div>
  );
}
