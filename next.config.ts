import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.2.25"],
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
