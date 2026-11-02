import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env by itself. Node's built-in loader avoids a dotenv dependency.
if (existsSync(".env")) process.loadEnvFile(".env");

// Migrations use the direct (non-pooled) Neon connection. The app uses the pooled
// DATABASE_URL through the pg driver adapter (src/lib/db.ts).
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
