import React, { useState } from "react";
import { Lock, Sparkles, Loader2 } from "lucide-react";
import { COLORS } from "./theme.jsx";
import { useAuth } from "./AuthContext.jsx";

export function Locked({ feature, children }) {
  const { tier, toggleTier } = useAuth();
  const [upgrading, setUpgrading] = useState(false);

  if (tier === "paid") return children;

  const upgrade = async () => {
    setUpgrading(true);
    try {
      await toggleTier();
    } finally {
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
          Upgrade to unlock {feature.toLowerCase()}.
        </p>
        <button className="ss-btn-primary" onClick={upgrade} disabled={upgrading}>
          {upgrading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
          Upgrade to unlock
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
