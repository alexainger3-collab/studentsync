import "dotenv/config";
import { createApp } from "./app.js";

const port = process.env.API_PORT || 8787;
const app = createApp();

app.listen(port, () => {
  console.log(`StudentSync API listening on http://localhost:${port}`);
});
