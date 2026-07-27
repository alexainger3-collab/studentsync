import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const appDataRouter = Router();

appDataRouter.get("/", requireAuth, async (req, res) => {
  const { rows } = await db.execute({ sql: "SELECT data FROM app_data WHERE user_id = ?", args: [req.session.userId] });
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "No data found for this account." });
  res.json(JSON.parse(row.data));
});

appDataRouter.put("/", requireAuth, async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }
  await db.execute({
    sql: "UPDATE app_data SET data = ?, updated_at = datetime('now') WHERE user_id = ?",
    args: [JSON.stringify(data), req.session.userId],
  });
  res.json({ ok: true });
});
