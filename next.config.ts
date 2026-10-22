import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Docker: trace only the files the server needs into .next/standalone (see Dockerfile).
  output: "standalone",
  // Every `path.join(process.cwd(), …)` and dynamic fs call in src/ carries a
  // `/*turbopackIgnore: true*/` comment; without it the build warns "Encountered
  // unexpected file in NFT list". The upload routes still trace the project root
  // silently (outputFileTracingExcludes did not stop it), which is why the Dockerfile
  // copies server.js, .next, package.json and node_modules out of .next/standalone one
  // by one instead of the whole folder.
  // Other devices on the network may open the dev server (hot reload included):
  // this PC's LAN address and the phone's.
  allowedDevOrigins: ["192.168.2.35", "192.168.2.25"],
  // Old Dutch route names — permanent redirects so bookmarks and the installed
  // PWA keep working after the rename to English routes.
  async redirects() {
    return [
      { source: "/schulden", destination: "/debts", permanent: true },
      { source: "/nettovermogen", destination: "/net-worth", permanent: true },
      { source: "/prognose", destination: "/forecast", permanent: true },
      // /savings was replaced by the unified /goals page (savings + expense goals).
      { source: "/savings", destination: "/goals", permanent: true },
    ];
  },
};

// Wires next-intl into the build. With no argument it looks for the request config at
// ./src/i18n/request.ts (the default location), which is where we placed it.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
