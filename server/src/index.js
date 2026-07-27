import "dotenv/config";
import { createApp } from "./app.js";
import { initDb } from "./db/index.js";
import { startSessionCleanup } from "./db/sqliteSessionStore.js";

// In production (Render), only PORT is set, and it must be respected — Render
// assigns it dynamically. In local dev, PORT is intentionally ignored even if
// something in the ambient shell environment happens to set it (e.g. tooling
// that manages a separate frontend dev server on its own port), since this
// process's own dev port is API_PORT/8787, not whatever PORT happens to hold.
const port = process.env.NODE_ENV === "production"
  ? (process.env.PORT || 8787)
  : (process.env.API_PORT || 8787);

await initDb();
startSessionCleanup();

const app = createApp();
app.listen(port, () => {
  console.log(`StudentSync API listening on port ${port}`);
});
