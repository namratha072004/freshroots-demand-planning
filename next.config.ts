import type { NextConfig } from "next";

// Every page is live, per-request data behind the login, so Cache Components is off.
const nextConfig: NextConfig = {
  // The CSVs in /data are read at run time (process.cwd()/data). Without this, Vercel's trace would leave them out.
  outputFileTracingIncludes: {
    "/*": ["./data/**/*"],
    "/api/cron/run": ["./data/**/*"],
  },
};

export default nextConfig;
