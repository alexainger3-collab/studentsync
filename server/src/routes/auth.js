import { Router } from "express";
import bcrypt from "bcrypt";
import { createUser, findUserByEmail, findUserById, toPublicUser } from "../db/users.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post("/signup", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (await findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser(email, passwordHash);
  req.session.userId = user.id;
  res.json(toPublicUser(user));
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  req.session.userId = user.id;
  res.json(toPublicUser(user));
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: "Not signed in." });
  res.json(toPublicUser(user));
});
