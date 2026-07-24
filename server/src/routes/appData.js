import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const appDataRouter = Router();

const getStmt = db.prepare("SELECT data FROM app_data WHERE user_id = ?");
const putStmt = db.prepare(
  "UPDATE app_data SET data = ?, updated_at = datetime('now') WHERE user_id = ?"
);

appDataRouter.get("/", requireAuth, (req, res) => {
  const row = getStmt.get(req.session.userId);
  if (!row) return res.status(404).json({ error: "No data found for this account." });
  res.json(JSON.parse(row.data));
});

appDataRouter.put("/", requireAuth, (req, res) => {
  const data = req.body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }
  putStmt.run(JSON.stringify(data), req.session.userId);
  res.json({ ok: true });
});
