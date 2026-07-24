import express from "express";
import session from "express-session";
import { SqliteSessionStore } from "./db/sqliteSessionStore.js";
import { authRouter } from "./routes/auth.js";
import { appDataRouter } from "./routes/appData.js";
import { accountRouter } from "./routes/account.js";

export function createApp() {
  const app = express();

  app.use(
    session({
      store: new SqliteSessionStore(),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // set true once served over https in production
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

  app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

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
