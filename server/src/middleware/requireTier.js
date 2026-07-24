import { findUserById } from "../db/users.js";

export function requireTier(tier) {
  return (req, res, next) => {
    const user = findUserById(req.session.userId);
    if (!user || user.tier !== tier) {
      return res.status(403).json({ error: `This feature requires the ${tier} plan.` });
    }
    next();
  };
}
