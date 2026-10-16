# AI roadmap (Gemini)

Planned AI features for Centje, in build order. One feature per session/commit.

## What already exists (October 2026)

- **Gemini client** — `src/lib/gemini.ts`: settings (`ai_enabled`, `ai_gemini_key`, `ai_model` in
  `app_settings`), `listModels`, `generateJson(prompt, schema)` with JSON output, automatic model
  fallback past paid-only models, quota-error reading (`readQuotaError`), `redactForAi()` to strip
  IBANs, card numbers and long references. Key never leaves the server.
- **Features** — `src/lib/ai-features.ts` (`suggestCategories`, `summarizePeriod` + cache in
  `app_settings.ai_summaries`), server actions in `src/app/actions/ai.ts`.
- **UI** — Settings › AI (`src/components/settings/ai-settings-panel.tsx`), Ask AI in Needs a
  category (`src/app/transactions/needs-review/needs-review-view.tsx`), Summary card on Insights ›
  Overview (`src/app/reports/ai-summary-card.tsx`).
- **Diagnostics** — `npm run ai:check` (`scripts/ai-check.ts`).

## Ground rules for every AI feature

- Only show it when `isAiReady()`; hide it otherwise (no dead buttons).
- Send the minimum: merchant text through `redactForAi`, amounts, dates, category names. Never
  account numbers, never whole histories when an aggregate will do.
- One request per user action, batched (free-tier limits). Cache results the user may reopen.
- AI proposes, the user confirms. Nothing is written without a tap.
- Handle every `AiError` with its own translated message (`errors.*` keys exist per surface).
- Clear design, translation function for all text (en + nl), and a tip (`src/lib/tips.ts`, add to
  `IGNORES_DISABLED`) for each new feature, per CLAUDE.md.
- Pure helpers get a test in `tests/lib/`.

---

## 1. AI picks become rules

**Why:** sort a merchant once with AI; rules handle it for good — fewer AI calls every month.

- Needs a category already has "Also create a rule". When the staged category is the AI pick
  (sparkle), switch the rule on by default.
- Add Ask AI to the shared category picker (`src/components/category-picker.tsx`, apply mode).
  Let `/api/category-suggestions` also return `aiReady` so the picker knows without a prop.
  For several ids, stage the category Gemini picks most often.
- Small: one commit.

## 2. Ask AI during CSV import

**Why:** import is where most sorting happens; categorise before rows land in Needs a category.

- Import Check step (`src/components/import-csv-card.tsx`, `src/lib/import-preview.ts`): a
  "Suggest categories" action for rows no rule matched, one batch per distinct merchant (not per
  row), capped like `AI_CATEGORY_BATCH`.
- Show the pick per merchant with a sparkle and an "also make a rule" switch (default on).
- Reuse `suggestCategories` but key the prompt by merchant name instead of transaction id.

## 6. Readable names for cryptic descriptions

**Why:** "BEA NR:XYZ 23.11 CCV*SHOP 1234" → "Shop name"; Activity becomes readable.

- Target: transactions with no merchant or a merchant whose name equals the raw description
  (`src/lib/merchants.ts`, `merchant-name.ts`, `friendly-names.ts`).
- Batch distinct raw descriptions (redacted) → `{ raw, name }`. Write to the merchant's display
  name / friendly name only after the user accepts a list (Settings › Merchants or Data health).
- Never touch `description` itself (matching and rules depend on it).

## 3. Find recurring bills and payment plans

**Why:** the detector (`src/lib/detect-recurring.ts`) misses changing amounts and names.

- Input: per merchant, 6–12 months of (date, amount) — aggregated, no account data.
- Output: proposals `{ merchant, type: bill|subscription|income|plan, amount, frequency,
  dueDay, planParts? }`. Show as a review list; accepting opens the recurring editor prefilled
  (`RecurringClient` with `prefill`, type `plan` supported).
- Skip merchants that already have a recurring item (`findRecurringItemByName`, signatures).

## 4. Explain an odd month

**Why:** sharper than the general summary: "why is this month different?"

- Insights › Overview button next to Summary. Server builds per-category this period vs the
  average of the previous 3 periods, plus top merchant deltas inside the biggest movers.
- Gemini returns `{ causes: [{ category, amount, reason }] }` (2–3 items) — render as rows with
  the real numbers from our data, AI only writes the reason sentence.
- Cache like `ai_summaries` (same key shape, separate setting key).

## 7. Payday check-in

**Why:** a short "what's ahead this month" right when the salary lands.

- Trigger: Home, once per financial month, when the income recurring item for this month is
  paid (`getBillStatuses`, type income).
- Input: bills and plan parts still due (`getBillStatuses`), forecast verdict and low point
  (`getCashFlowForecast`, `judgeForecast` — includes overdraft), budget left.
- Output: 2–3 sentences + one suggestion. Dismissible card; cache per month.

## 5. Ask Centje (question → filter)

**Why:** "How much did I spend on takeaway since summer?" — answered exactly and privately.

- Gemini only translates the question into a structured query: `{ metric: sum|count|average,
  direction, categoryIds?, merchantNames?, from, to, groupBy? }` validated against our
  categories/merchants. The app runs the query itself and shows the number plus a link to the
  filtered Activity list (`/transactions?…`).
- The model never sees transactions. Reject anything the schema can't express ("I can't answer
  that yet") instead of guessing.
- Biggest feature: a field in global search or Insights, its own session.

---

## Deliberately not planned

- A free-form chat with access to all transactions (privacy, free-tier quota).
- AI-made budgets or investment advice (wrong answers cost real money).
