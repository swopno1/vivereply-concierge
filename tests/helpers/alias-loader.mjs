// ESM loader for `pnpm test`: resolves the `@/` TS alias to the repo
// root and allows extensionless `.ts` imports, so node --test can run
// TypeScript test subjects directly (with --experimental-transform-types).
// No framework, no build step — pure modules only. Anything needing a
// database, network, or Next.js runtime does not belong in tests/.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..") + "/";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let mapped = ROOT + specifier.slice(2);
    if (!mapped.endsWith(".ts") && existsSync(mapped + ".ts")) mapped += ".ts";
    return next(pathToFileURL(mapped).href, context);
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (context.parentURL?.startsWith("file:")) {
      const base = new URL(specifier, context.parentURL).pathname;
      if (!/\.(ts|js|mjs|cjs)$/.test(base) && existsSync(base + ".ts")) {
        return next(pathToFileURL(base + ".ts").href, context);
      }
    }
  }
  return next(specifier, context);
}
