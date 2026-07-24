import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // 'loading' | 'authed' | 'anon'

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      setStatus("authed");
    } catch {
      setUser(null);
      setStatus("anon");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signup = async (email, password) => {
    const me = await api.signup(email, password);
    setUser(me);
    setStatus("authed");
  };

  const login = async (email, password) => {
    const me = await api.login(email, password);
    setUser(me);
    setStatus("authed");
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setStatus("anon");
  };

  const toggleTier = async () => {
    const me = await api.toggleTier();
    setUser(me);
  };

  return (
    <AuthContext.Provider value={{ user, tier: user?.tier || "free", status, signup, login, logout, refresh, toggleTier }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
