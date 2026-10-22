import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      // eslint-config-next 16.4 made this an error. Eight components still set state
      // inside an effect to mirror a prop into local state (the multi-pickers, the app
      // lock gate, the colour picker, the settings dialog, …). Fix them one by one with
      // derived state or a key; until then it stays a warning so a security upgrade
      // does not force an untested refactor.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees are full checkouts of other branches, not part of this one.
    ".claude/**",
    // The docs site is its own Astro project with its own tooling.
    "website/**",
  ]),
]);

export default eslintConfig;
