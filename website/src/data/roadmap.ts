// The roadmap's content, in one place: the page (src/components/Roadmap.astro) and the
// landing page's teaser (src/components/RoadmapTeaser.astro) both read it, so moving an
// item between phases is one edit. Tones are the Clear pastels (see src/styles/clear.css).

export type Tone = "ember" | "sky" | "lilac" | "stone";

export type RoadmapItem = {
  title: string;
  text: string;
  /** True when the feature uses the optional AI; the page can filter on it. */
  ai?: boolean;
};

export type RoadmapPhase = {
  id: string;
  /** The short word on the timeline: Now, Next, Later, Not planned. */
  title: string;
  /** The status chip: In progress, Planned, Ideas we like, Deliberately not. */
  status: string;
  lead: string;
  tone: Tone;
  items: RoadmapItem[];
};

export const phases: RoadmapPhase[] = [
  {
    id: "now",
    title: "Now",
    status: "In progress",
    lead: "What is being built at the moment.",
    tone: "ember",
    items: [
      { title: "Documentation", text: "This guide, with every page explained step by step." },
    ],
  },
  {
    id: "next",
    title: "Next",
    status: "Planned",
    lead: "Decided and queued, roughly in this order.",
    tone: "sky",
    items: [
      {
        title: "AI picks become rules",
        text: "When you file a merchant with the AI's suggestion, Arca offers to make it a rule straight away, so next month it's sorted without asking the AI again.",
        ai: true,
      },
      {
        title: "Ask AI during import",
        text: "Get category suggestions for new merchants while you check an import, before anything lands in Needs a category.",
        ai: true,
      },
      {
        title: "Merchant cleanup",
        text: "For cryptic bank descriptions, the AI suggests a readable name, the patterns to recognise it, a likely category and a fitting logo. You review the suggestions; nothing changes by itself.",
        ai: true,
      },
      {
        title: "Rules from examples",
        text: "Select a few transactions (\"these are all groceries\") and Arca suggests the simplest rule that catches them all. Without AI, it suggests the shared name, as today.",
        ai: true,
      },
      {
        title: "Find recurring bills and payment plans",
        text: "Spot regular payments the current detection misses, like bills whose amount or name changes. Each one becomes a suggestion you can accept.",
        ai: true,
      },
      {
        title: "Explain an odd month",
        text: "\"Why is this month different?\" The two or three categories that moved most, with the real numbers, and a short reason for each.",
        ai: true,
      },
      {
        title: "The forecast in words",
        text: "Two plain sentences about what's coming, like \"You dip below zero on the 27th because the insurance and the gym land before payday.\" The forecast and its warnings stay calculated by Arca.",
        ai: true,
      },
      {
        title: "Missing bill check",
        text: "Arca asks the AI which regular payments seem to be missing from your forecast, like a yearly premium or a quarterly water bill, and offers to add them.",
        ai: true,
      },
      {
        title: "Receipt line items",
        text: "Read a receipt photo into separate lines, so a supermarket receipt becomes a split with groceries and household items, ready for you to check.",
        ai: true,
      },
      {
        title: "Payday check-in",
        text: "When your salary lands, a short note about the month ahead: bills still to come, the forecast's low point and what's left in your budget, with one suggestion.",
        ai: true,
      },
      {
        title: "Import column mapping",
        text: "For a bank Arca doesn't know, the AI suggests which column is the date, the amount and the description, and you confirm.",
        ai: true,
      },
      {
        title: "Ask Arca",
        text: "Ask a question like \"How much did I spend on takeaway since summer?\" The AI only turns your question into a search; Arca does the counting itself and shows the transactions behind the answer. The AI never sees your transactions.",
        ai: true,
      },
      {
        title: "Notifications",
        text: "A heads-up for upcoming bills, a shortfall in the forecast, and the payday check-in, by push notification or email.",
      },
      {
        title: "More banks in the bank connection",
        text: "More banks, and more countries than the Netherlands.",
      },
      {
        title: "Dutch documentation",
        text: "This guide in Dutch too.",
      },
    ],
  },
  {
    id: "later",
    title: "Later",
    status: "Ideas we like",
    lead: "Not scheduled yet. Say which ones you'd use and they move up.",
    tone: "lilac",
    items: [
      { title: "Automatic backups", text: "From Settings, on a schedule, to a folder of your choice." },
      { title: "Exports and printable reports", text: "A year overview or a month on paper, or your transactions as a file." },
      { title: "Widgets and home-screen shortcuts", text: "Safe to spend and quick add on your phone's home screen." },
      { title: "Household views per person", text: "Who spent what, and personal budgets next to the shared ones." },
      { title: "Multi-currency", text: "Accounts in different currencies, converted for your totals." },
      { title: "Investments in net worth", text: "Follow the value of your investments over time." },
      { title: "Password reset", text: "For the person who runs the server." },
    ],
  },
  {
    id: "not-planned",
    title: "Not planned",
    status: "Deliberately not",
    lead: "Things we decided against, and why.",
    tone: "stone",
    items: [
      {
        title: "A free-form AI chat with access to all your transactions",
        text: "Too much data leaving your server, and too much for a free key.",
        ai: true,
      },
      {
        title: "AI-made budgets or investment advice",
        text: "Wrong answers here cost real money.",
        ai: true,
      },
      {
        title: "AI-calculated forecasts, balances or totals",
        text: "These stay calculated by Arca, so they're exact, work offline and cost nothing.",
        ai: true,
      },
      {
        title: "AI deciding your rules",
        text: "Rules stay predictable, so they run on every import, offline and for free.",
        ai: true,
      },
    ],
  },
];

export const aiRules: { title: string; text: string }[] = [
  {
    title: "AI explains, the app computes.",
    text: "Every number on screen comes from Arca itself: the forecast, budgets and totals. The AI writes sentences and picks from your own lists. It never makes up an amount or a date.",
  },
  {
    title: "Opt-in, per feature.",
    text: "AI is off until you add your own key and switch it on, and each AI feature gets its own switch, so you can keep one and refuse another.",
  },
  {
    title: "The minimum leaves your server.",
    text: "Only what a feature needs (cleaned-up descriptions, amounts, dates, category names), never account numbers and never your whole history when a total will do.",
  },
  {
    title: "You confirm.",
    text: "Nothing is saved without a tap.",
  },
  {
    title: "Everything keeps working without it.",
    text: "Turn AI off and Arca is the same app, with the same numbers.",
  },
];

export const feedbackUrl = "https://github.com/damianeickhoff/Arca/issues";
