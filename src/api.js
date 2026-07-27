async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const message = payload?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload;
}

export const api = {
  signup: (email, password) => request("POST", "/auth/signup", { email, password }),
  login: (email, password) => request("POST", "/auth/login", { email, password }),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),
  getData: () => request("GET", "/data"),
  saveData: (data) => request("PUT", "/data", data),
  createCheckoutSession: () => request("POST", "/billing/create-checkout-session"),
  createPortalSession: () => request("POST", "/billing/create-portal-session"),
};
