import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../modules/context/AuthContext";
import { apiRequest } from "../../modules/common/api";

type StockItem = {
  ticker: string;
  name: string;
  closePrice: number;
  changePrice: number;
  percentage: number;
  tradeValue: number;
  isUp: boolean;
};

// mini candlestick chart dekoratif di background
const CandlestickBg = () => {
  const candles = [
    { x: 0, high: 20, open: 60, close: 30, low: 80 },
    { x: 1, high: 10, open: 40, close: 20, low: 70 },
    { x: 2, high: 15, open: 55, close: 40, low: 75 },
    { x: 3, high: 5, open: 30, close: 15, low: 60 },
    { x: 4, high: 12, open: 45, close: 25, low: 65 },
    { x: 5, high: 8, open: 35, close: 50, low: 72 },
    { x: 6, high: 18, open: 60, close: 45, low: 78 },
    { x: 7, high: 3, open: 25, close: 10, low: 55 },
    { x: 8, high: 10, open: 42, close: 28, low: 68 },
    { x: 9, high: 6, open: 32, close: 48, low: 62 },
  ];

  return (
    <svg
      viewBox="0 0 200 100"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: 180,
        opacity: 0.07,
      }}
      preserveAspectRatio="none"
    >
      {candles.map((c) => {
        const isGain = c.close < c.open;
        const color = isGain ? "#10b981" : "#ef4444";
        const x = c.x * 20 + 5;
        const bodyTop = Math.min(c.open, c.close);
        const bodyH = Math.abs(c.open - c.close);
        return (
          <g key={c.x}>
            <line x1={x + 5} y1={c.high} x2={x + 5} y2={c.low} stroke={color} strokeWidth={1} />
            <rect x={x} y={bodyTop} width={10} height={bodyH} fill={color} />
          </g>
        );
      })}
    </svg>
  );
};

const features = [
  {
    icon: "📈",
    title: "Analisis Saham",
    desc: "Tanya tentang IHSG, saham individual, atau sektor tertentu.",
  },
  {
    icon: "🔍",
    title: "Screening Otomatis",
    desc: "Temukan saham dengan kriteria valuasi, teknikal, atau fundamental.",
  },
  {
    icon: "💼",
    title: "Monitor Portofolio",
    desc: "Pantau kinerja dan rebalancing portofolio saham kamu.",
  },
];

const fallbackStocks: StockItem[] = [
  { ticker: "BBCA", name: "", closePrice: 0, changePrice: 0, percentage: 1.2, tradeValue: 0, isUp: true },
  { ticker: "TLKM", name: "", closePrice: 0, changePrice: 0, percentage: -0.8, tradeValue: 0, isUp: false },
  { ticker: "ASII", name: "", closePrice: 0, changePrice: 0, percentage: 0.4, tradeValue: 0, isUp: true },
  { ticker: "GOTO", name: "", closePrice: 0, changePrice: 0, percentage: 2.1, tradeValue: 0, isUp: true },
  { ticker: "BBRI", name: "", closePrice: 0, changePrice: 0, percentage: 0, tradeValue: 0, isUp: true },
  { ticker: "KCFA", name: "", closePrice: 0, changePrice: 0, percentage: 0, tradeValue: 0, isUp: true },
  { ticker: "BMRI", name: "", closePrice: 0, changePrice: 0, percentage: 0, tradeValue: 0, isUp: true },
  { ticker: "BUMI", name: "", closePrice: 0, changePrice: 0, percentage: 0, tradeValue: 0, isUp: true },
];

const oauthErrorMessages: Record<string, string> = {
  login_gagal: "Login Google gagal. Cek GOOGLE_REDIRECT_URI di API dan Google Console.",
  missing_code: "Google tidak mengembalikan kode otorisasi.",
  email_tidak_tersedia: "Akun Google tidak memberi email (scope).",
};

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stocks, setStocks] = useState<StockItem[]>([]);

  useEffect(() => {
    apiRequest<StockItem[]>("/api/public/stocks/top-trade-value")
      .then((data) => setStocks(data.slice(0, 8)))
      .catch(() => { /* silent fail - gunakan fallback */ });
  }, []);

  const tickerList = stocks.length > 0 ? stocks : fallbackStocks;

  useEffect(() => {
    const code = searchParams.get("oauth_error");
    if (!code) return;
    const msg = oauthErrorMessages[code] ?? decodeURIComponent(code.replace(/\+/g, " "));
    setError(msg);
    const next = new URLSearchParams(searchParams);
    next.delete("oauth_error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch {
      setError("Gagal memulai login. Coba lagi.");
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        background: "#020617",
      }}
    >
      {/* panel kiri - branding */}
      <div
        style={{
          position: "relative",
          padding: "60px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflow: "hidden",
          background: "linear-gradient(145deg, #0a1628 0%, #020617 100%)",
          borderRight: "1px solid rgba(16, 185, 129, 0.08)",
        }}
      >
        {/* decorative grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <CandlestickBg />

        <div style={{ position: "relative" }}>
          {/* logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 56 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #10b981, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              📈
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>StockPick AI</span>
          </div>

          {/* headline */}
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: "-0.03em",
              marginBottom: 16,
              color: "#f1f5f9",
            }}
          >
            Asisten AI untuk
            <br />
            <span style={{ color: "#10b981" }}>analisis saham</span>
            <br />
            Indonesia
          </div>
          <div style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, maxWidth: 360, marginBottom: 48 }}>
            Tanya, analisis, dan monitor portofolio saham kamu dengan bantuan AI yang memahami pasar IDX.
          </div>

          {/* features */}
          <div style={{ display: "grid", gap: 20 }}>
            {features.map((f) => (
              <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, color: "#e2e8f0" }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* running ticker bottom */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            fontSize: 12,
            color: "#334155",
            paddingTop: 24,
            borderTop: "1px solid rgba(148, 163, 184, 0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 24,
              width: "max-content",
              animation: "tickerScroll 30s linear infinite",
            }}
          >
            {[...tickerList, ...tickerList].map((s, i) => (
              <div key={`${s.ticker}-${i}`} style={{ display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
                <span style={{ color: "#475569" }}>{s.ticker}</span>
                <span style={{ color: s.isUp ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                  {s.percentage >= 0 ? "+" : ""}{s.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          <style>{`
            @keyframes tickerScroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </div>
      </div>

      {/* panel kanan - form login */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 56px",
          background: "#020617",
        }}
      >
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 8,
                color: "#f1f5f9",
              }}
            >
              Masuk ke StockPick AI
            </div>
            <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
              Gunakan akun Google untuk mulai analisis saham dengan AI.
            </div>
          </div>

          {/* kotak login */}
          <div
            style={{
              background: "#0f172a",
              border: "1px solid rgba(148, 163, 184, 0.1)",
              borderRadius: 20,
              padding: 28,
            }}
          >
            {error && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "#fca5a5",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: "14px 20px",
                borderRadius: 12,
                border: "1px solid rgba(148, 163, 184, 0.15)",
                background: isLoading ? "#1e293b" : "#1e293b",
                color: "#e2e8f0",
                fontSize: 15,
                fontWeight: 600,
                cursor: isLoading ? "not-allowed" : "pointer",
                transition: "background 0.15s, border-color 0.15s",
                opacity: isLoading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#263348";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(148, 163, 184, 0.25)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#1e293b";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(148, 163, 184, 0.15)";
              }}
            >
              {isLoading ? (
                <>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      border: "2px solid rgba(255,255,255,0.15)",
                      borderTop: "2px solid #e2e8f0",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  Mengarahkan ke Google...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Masuk dengan Google
                </>
              )}
            </button>

            <div
              style={{
                marginTop: 20,
                padding: "14px 16px",
                borderRadius: 10,
                background: "rgba(16, 185, 129, 0.04)",
                border: "1px solid rgba(16, 185, 129, 0.1)",
              }}
            >
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                Dengan masuk, kamu setuju dengan kebijakan privasi dan ketentuan penggunaan StockPick AI.
                Data akun hanya digunakan untuk autentikasi.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#334155" }}>
            Didukung oleh AI untuk analisis pasar IDX
          </div>
        </div>
      </div>
    </div>
  );
}
