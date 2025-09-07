import type { Config } from "drizzle-kit";

export default {
  schema: "./database/schema/index.ts",
  out: "./database/migrations",
  dialect: "sqlite",
  verbose: true,
  strict: true,
} satisfies Config;
