import React, { useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { COLORS, GlobalStyle } from "./theme.jsx";
import { useAuth } from "./AuthContext.jsx";

export function Signup({ onSwitchToLogin }) {
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signup(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ss-root" style={{
      background: COLORS.ink, padding: "40px 16px", minHeight: "100svh",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <GlobalStyle />
      <form onSubmit={submit} style={{
        background: COLORS.paper, borderRadius: 20, padding: "36px 40px", maxWidth: 400,
        margin: "0 auto", boxShadow: "0 20px 50px rgba(0,0,0,.35)",
      }}>
        <h1 className="ss-display" style={{ fontSize: 26, fontWeight: 600, color: COLORS.textDark, margin: "0 0 6px" }}>
          Create your account
        </h1>
        <p style={{ color: "#6b6650", fontSize: 14, marginTop: 0, marginBottom: 22 }}>
          Set up StudentSync — free to start.
        </p>

        <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>Email</label>
        <input className="ss-input" type="email" required autoComplete="email" style={{ marginTop: 6, marginBottom: 14 }}
          value={email} onChange={(e) => setEmail(e.target.value)} />

        <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>Password</label>
        <input className="ss-input" type="password" required minLength={8} autoComplete="new-password" style={{ marginTop: 6, marginBottom: 4 }}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <p style={{ fontSize: 12, color: "#9a927a", marginTop: 0, marginBottom: 14 }}>At least 8 characters.</p>

        {error && <p style={{ color: COLORS.Work, fontSize: 13, marginTop: 0, marginBottom: 14 }}>{error}</p>}

        <button className="ss-btn-primary" type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
          {submitting ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <UserPlus size={15} />}
          Sign up
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <p style={{ fontSize: 13, color: "#6b6650", textAlign: "center", marginTop: 18, marginBottom: 0 }}>
          Already have an account?{" "}
          <button type="button" onClick={onSwitchToLogin} style={{
            background: "none", border: "none", padding: 0, color: COLORS.School, fontWeight: 600, cursor: "pointer", fontSize: 13,
          }}>
            Log in
          </button>
        </p>
      </form>
    </div>
  );
}
