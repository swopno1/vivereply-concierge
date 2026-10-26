import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Session-mode pooler — used by migrations and `prisma db` commands.
    url: env("DIRECT_URL"),
  },
});
