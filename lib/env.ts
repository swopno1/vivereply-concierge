// Env loader for standalone scripts (step 3 fix). Next.js loads env
// files itself for the app, but a tsx script does not — so a script
// MUST import this FIRST, before lib/prisma, or DATABASE_URL and
// GEMINI_API_KEY will still be undefined when the Prisma Pool is
// created at import time (import order matters: this module runs
// before lib/prisma is evaluated, a dotenv.config() call in the
// script body itself would run too late).
//
// .env.local wins; .env fills the gaps (dotenv never overwrites a
// variable that is already set).

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
