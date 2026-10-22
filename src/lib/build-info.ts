import { APP_VERSION } from "@/lib/app-version";

/**
 * What build is running, so a dev image can say so and a release never does. The
 * Dockerfile bakes ARCA_BUILD_REF / ARCA_BUILD_SHA / ARCA_BUILD_DATE from the CI build
 * args (publish.yml); a release image is built from the vX.Y.Z tag, everything else is
 * a branch. Outside Docker (npm run dev / next start on a PC) nothing is set: "local".
 */
export type BuildChannel = "release" | "dev" | "branch" | "local";

export interface BuildInfo {
  version: string;
  channel: BuildChannel;
  /** The branch or tag the image was built from ("dev", "v1.6.1", "feature-x"); "" when local. */
  ref: string;
  /** Short commit hash; "" when local. */
  sha: string;
  /** ISO build time; "" when local. */
  date: string;
  /** True for anything that is not a release image: the sidebar and About show a chip. */
  prerelease: boolean;
}

export function buildInfoFromEnv(env: Record<string, string | undefined> = process.env, version = APP_VERSION): BuildInfo {
  const ref = (env.ARCA_BUILD_REF ?? "").trim();
  const sha = (env.ARCA_BUILD_SHA ?? "").trim().slice(0, 7);
  const date = (env.ARCA_BUILD_DATE ?? "").trim();
  let channel: BuildChannel;
  if (!ref) channel = "local";
  else if (/^v\d+\.\d+\.\d+/.test(ref)) channel = "release";
  else if (ref === "dev") channel = "dev";
  else channel = "branch";
  return { version, channel, ref, sha, date, prerelease: channel !== "release" };
}

let cached: BuildInfo | null = null;

/** The running build, read once from the environment. Server only. */
export function getBuildInfo(): BuildInfo {
  if (!cached) cached = buildInfoFromEnv();
  return cached;
}
