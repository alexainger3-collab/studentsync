import { Router } from "express";
import { findUserById, setUserTier, toPublicUser } from "../db/users.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const accountRouter = Router();

// No real billing is wired up — this simply flips the signed-in account's own
// tier between 'free' and 'paid' so the paid-feature UI can be tried out.
accountRouter.post("/toggle-tier", requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  const nextTier = user.tier === "paid" ? "free" : "paid";
  setUserTier(user.id, nextTier);
  res.json(toPublicUser(findUserById(user.id)));
});
