import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, env } from "prisma/config";

const serverRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverRoot, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
