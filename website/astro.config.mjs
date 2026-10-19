// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// The site lives under /Arca/ on GitHub Pages. Links between pages in Markdown are
// written with this prefix, for example [Budget](/Arca/plan/budget/).
const BASE = "/Arca";

// The Arca user guide, published to GitHub Pages at https://damianeickhoff.github.io/Arca/.
// Styled after the app's "Clear" design: see src/styles/clear.css.
export default defineConfig({
  site: "https://damianeickhoff.github.io",
  base: BASE,
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Arca",
      description: "A calm, self-hosted personal finance app.",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      // English lives at the root. To add Dutch later, add
      //   nl: { label: "Nederlands", lang: "nl" },
      // and put the translated pages in src/content/docs/nl/. Pages that are not
      // translated yet fall back to English automatically.
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
      },
      social: [
        { icon: "github", label: "Arca on GitHub", href: "https://github.com/damianeickhoff/Arca" },
      ],
      customCss: [
        "@fontsource-variable/plus-jakarta-sans",
        "./src/styles/clear.css",
      ],
      components: {
        Hero: "./src/components/Hero.astro",
      },
      editLink: {
        baseUrl: "https://github.com/damianeickhoff/Arca/edit/master/website/",
      },
      // Code blocks (install pages): 16px tile corners, no frame line, the Clear font for labels.
      expressiveCode: {
        themes: ["github-dark", "github-light"],
        styleOverrides: {
          borderRadius: "16px",
          borderColor: "transparent",
          uiFontFamily: "'Plus Jakarta Sans Variable', sans-serif",
          codeFontSize: "0.8125rem",
        },
      },
      lastUpdated: false,
      credits: false,
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "What is Arca", slug: "getting-started/what-is-arca" },
            { label: "Install", slug: "getting-started/install" },
            { label: "First run", slug: "getting-started/first-run" },
            { label: "Updating and backups", slug: "getting-started/updating-and-backups" },
          ],
        },
        {
          label: "Everyday use",
          items: [
            { label: "Home", slug: "everyday/home" },
            { label: "Activity", slug: "everyday/activity" },
            { label: "Add, search and shortcuts", slug: "everyday/add-and-search" },
            { label: "Needs a category", slug: "everyday/needs-a-category" },
            { label: "Upcoming", slug: "everyday/upcoming" },
          ],
        },
        {
          label: "Getting transactions in",
          items: [
            { label: "Bank connection", slug: "transactions/bank-connection" },
            { label: "CSV import", slug: "transactions/csv-import" },
            { label: "Rules and merchants", slug: "transactions/rules-and-merchants" },
          ],
        },
        {
          label: "Plan",
          items: [
            { label: "Budget", slug: "plan/budget" },
            { label: "Recurring and payment plans", slug: "plan/recurring" },
            { label: "Debts", slug: "plan/debts" },
            { label: "Goals", slug: "plan/goals" },
          ],
        },
        {
          label: "Insights",
          items: [
            { label: "Overview", slug: "insights/overview" },
            { label: "Trends", slug: "insights/trends" },
            { label: "Net worth", slug: "insights/net-worth" },
            { label: "Forecast", slug: "insights/forecast" },
            { label: "Health score", slug: "insights/health" },
          ],
        },
        {
          label: "Settings",
          items: [
            { label: "Accounts and assets", slug: "settings/accounts" },
            { label: "Sign-in and security", slug: "settings/security" },
            { label: "Preferences", slug: "settings/preferences" },
            { label: "Categories and groups", slug: "settings/categories" },
            { label: "Data health and undo", slug: "settings/data-health" },
            { label: "AI (Gemini)", slug: "settings/ai" },
          ],
        },
        {
          label: "Help",
          items: [
            { label: "Questions and fixes", slug: "help/faq" },
            { label: "Get help", slug: "help/get-help" },
            { label: "Roadmap", slug: "roadmap" },
          ],
        },
      ],
    }),
  ],
});
