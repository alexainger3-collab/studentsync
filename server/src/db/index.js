import { createClient } from "@libsql/client";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL || "file:./data/studentsync.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith("file:")) {
  const localPath = url.slice("file:".length);
  mkdirSync(path.dirname(path.resolve(localPath)), { recursive: true });
}

export const db = createClient(authToken ? { url, authToken } : { url });

const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf8");

export async function initDb() {
  await db.executeMultiple(schema);
  await addColumnIfMissing("users", "stripe_customer_id", "TEXT");
  await addColumnIfMissing("users", "stripe_subscription_id", "TEXT");
}

// `CREATE TABLE IF NOT EXISTS` in schema.sql only helps brand-new tables —
// existing deployments need new columns added to a table that already has rows.
async function addColumnIfMissing(table, column, type) {
  const { rows } = await db.execute(`PRAGMA table_info(${table})`);
  const exists = rows.some((r) => r.name === column);
  if (!exists) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
