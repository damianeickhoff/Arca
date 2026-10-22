import pkg from "../../package.json";

/** The version in package.json, baked in at build time. The release skill bumps it;
 *  Settings › About shows it and the "What's new" tip compares it with the last one seen. */
export const APP_VERSION: string = pkg.version;
