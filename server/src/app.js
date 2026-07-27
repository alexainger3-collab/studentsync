import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteSessionStore } from "./db/sqliteSessionStore.js";
import { authRouter } from "./routes/auth.js";
import { appDataRouter } from "./routes/appData.js";
import { accountRouter } from "./routes/account.js";
import { privacyPolicyHtml } from "./routes/privacy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/app.js -> repo root, then the Vite build output
const CLIENT_DIST = path.resolve(__dirname, "..", "..", "dist");

export function createApp() {
  const app = express();

  // Render (and most PaaS hosts) terminate HTTPS at an edge proxy and forward
  // plain HTTP internally — without this, Express never sees the request as
  // secure, so secure:true session cookies would silently never get set.
  app.set("trust proxy", 1);

  app.use(
    session({
      store: new SqliteSessionStore(),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  // Default body-parser limit is 100kb, which a schedule with a few hundred
  // recurring items can exceed. 10mb gives generous headroom.
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/data", appDataRouter);
  app.use("/api/account", accountRouter);

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Store-listing requirement — a real route, not part of the SPA, so it
  // works in dev too and stays available before the catch-all below.
  app.get("/privacy", (req, res) => res.type("html").send(privacyPolicyHtml));

  if (process.env.NODE_ENV === "production") {
    // Same origin as the API — the frontend and backend are one deployed
    // service, so the mobile shell (and browsers) never need CORS.
    app.use(express.static(CLIENT_DIST));
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "That's too much data to save at once." });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}
