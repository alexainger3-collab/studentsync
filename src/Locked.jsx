import React, { useState } from "react";
import { Lock, Sparkles, Loader2 } from "lucide-react";
import { COLORS } from "./theme.jsx";
import { useAuth } from "./AuthContext.jsx";

export function Locked({ feature, children }) {
  const { tier, startCheckout } = useAuth();
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState("");

  if (tier === "paid") return children;

  const upgrade = async () => {
    setUpgrading(true);
    setError("");
    try {
      await startCheckout();
    } catch (err) {
      setError(err.message);
      setUpgrading(false);
    }
  };

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ filter: "blur(5px)", opacity: 0.45, pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 10,
        background: "rgba(20,25,40,.6)", textAlign: "center", padding: 20,
      }}>
        <Lock size={22} color={COLORS.textLight} />
        <div style={{ color: COLORS.textLight, fontWeight: 700, fontSize: 15 }}>{feature} is a paid feature</div>
        <p style={{ color: COLORS.textMuted, fontSize: 12, maxWidth: 280, margin: 0 }}>
          $2.99/month unlocks {feature.toLowerCase()} and everything else on the paid plan.
        </p>
        <button className="ss-btn-primary" onClick={upgrade} disabled={upgrading}>
          {upgrading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
          Upgrade — $2.99/mo
        </button>
        {error && <p style={{ color: COLORS.Work, fontSize: 11, margin: 0 }}>{error}</p>}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
