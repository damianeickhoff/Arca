# AI roadmap (Gemini)

Planned AI features for Centje, in build order. One feature per session/commit.

## What already exists (October 2026)

- **Gemini client** — `src/lib/gemini.ts`: settings (`ai_enabled`, `ai_gemini_key`, `ai_model` in
  `app_settings`), `listModels`, `generateJson(prompt, schema)` with JSON output, automatic model
  fallback past paid-only models, quota-error reading (`readQuotaError`), `redactForAi()` to strip
  IBANs, card numbers and long references. Key never leaves the server.
- **Features** — `src/lib/ai-features.ts` (`suggestCategories`, `summarizePeriod` — a structured
  headline, three facts and a tip from the facts built in `src/lib/period-facts.ts` — + cache in
  `app_settings.ai_summaries`), server actions in `src/app/actions/ai.ts`.
- **UI** — Settings › AI (`src/components/settings/ai-settings-panel.tsx`), Ask AI in Needs a
  category (`src/app/transactions/needs-review/needs-review-view.tsx`), Summary card on Insights ›
  Overview (`src/app/reports/summary-card.tsx`; with AI off it shows the computed facts instead).
- **Diagnostics** — `npm run ai:check` (`scripts/ai-check.ts`).

## Ground rules for every AI feature

- **Opt-in, per feature.** AI as a whole is off until the user adds a key and switches it on. On
  top of that, Settings › AI lists every AI feature with its own switch (stored as
  `ai_feature_<key>` in `app_settings`, default on once AI is on), so someone can keep category
  suggestions but refuse, say, the payday check-in. Every surface checks `isAiFeatureOn(key)`,
  not just `isAiReady()`.
- Only show a feature when it is on; hide it otherwise (no dead buttons). The Insights summary is
  the exception: with AI off it keeps its slot with the computed facts and a link to Settings › AI.
- Send the minimum: merchant text through `redactForAi`, amounts, dates, category names. Never
  account numbers, never whole histories when an aggregate will do.
- One request per user action, batched (free-tier limits). Cache results the user may reopen.
- AI proposes, the user confirms. Nothing is written without a tap.
- **AI explains, the app computes.** Every number on screen comes from our own code (forecast,
  budgets, totals). The model writes sentences and picks from lists; it never produces an amount
  or a date that is shown as fact.
- Handle every `AiError` with its own translated message (`errors.*` keys exist per surface).
- Clear design, translation function for all text (en + nl), and a tip (`src/lib/tips.ts`, add to
  `IGNORES_DISABLED`) for each new feature, per CLAUDE.md.
- Pure helpers get a test in `tests/lib/`.
- The `@anthropic-ai/sdk` dependency is unused; remove it (or wire it as a second provider behind
  the same `generateJson` interface) rather than leaving it in `package.json`.

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

## 3. Merchant cleanup on first sight

**Why:** the long tail of merchants gets a readable name, match patterns, a likely category and
icon keywords in one call, instead of the static `friendlyNames.ts` / `brandIcons.ts` lists and
the regex extractor.

- Trigger: a new merchant row (`getOrCreateMerchantId`) whose derived name equals, or barely
  shortens, the raw description. Batched per import, cached per `normalized_key`.
- Input: the redacted raw descriptions of that merchant (3–5 samples). Output per merchant:
  `{ name, patterns: string[], categoryId?, iconKeywords: string[] }`.
- The proposals land in a review list (Settings › Merchants or Data health); accepting writes
  the merchant's display name, its "recognised by" patterns and its default category. Nothing
  auto-applies. `description` itself is never changed (rules match on it).
- Icon keywords feed the icon picker's "Suggested for …" group.
- Replaces the older "Readable names for cryptic descriptions" item.

## 4. Rule authoring from examples

**Why:** "these five are all Groceries" is easier than typing a pattern.

- From a multi-select in Activity or Needs review: send the redacted descriptions, get back the
  smallest set of patterns (`contains` / `word`) that covers them. Show them in the "Always file
  … as …?" strip with the live match count from `/api/category-rules/preview`; the user edits or
  accepts.
- Deterministic fallback when AI is off: the shared prefix / merchant name, as today.

## 5. Find recurring bills and payment plans

**Why:** the detector (`src/lib/detect-recurring.ts`) misses changing amounts and names.

- Input: per merchant, 6–12 months of (date, amount) — aggregated, no account data.
- Output: proposals `{ merchant, type: bill|subscription|income|plan, amount, frequency,
  dueDay, planParts? }`. Show as a review list; accepting opens the recurring editor prefilled
  (`RecurringClient` with `prefill`, type `plan` supported).
- Skip merchants that already have a recurring item (`findRecurringItemByName`, signatures).

## 6. Explain an odd month

**Why:** sharper than the general summary: "why is this month different?"

- Insights › Overview button next to Summary. Server builds per-category this period vs the
  average of the previous 3 periods, plus top merchant deltas inside the biggest movers.
- Gemini returns `{ causes: [{ category, amount, reason }] }` (2–3 items) — render as rows with
  the real numbers from our data, AI only writes the reason sentence.
- Cache like `ai_summaries` (same key shape, separate setting key).

## 7. Forecast: explained and challenged, not computed

**Why:** the forecast status (`judgeForecast`: healthy / warning / critical and its reason) must
stay deterministic — it decides whether someone sees an ember warning about their overdraft, and
it has to work offline and on the free tier. What AI can add sits around it:

- **Plain-language verdict.** Turn the status, reason, low point, its date and the three
  events before it (`ForecastEvent`) into two sentences: "You dip to −€120 on the 27th because
  the car insurance and the gym land before payday. Moving €150 from Holiday savings covers
  it." Numbers are interpolated from our data, never generated. Cached per forecast input hash.
- **Missing-event check.** Give the model the recurring items it knows and the last 3 months
  of merchants; ask which regular payments seem absent from the forecast (a yearly premium that
  last hit in October, a quarterly water bill). Each answer becomes a "Add to forecast?"
  proposal that opens the recurring editor, same as item 5.
- **Override suggestions.** The forecast already has manual overrides (`prognose_overrides`).
  When a variable category has run far above its average for two months, suggest the override
  with the number from our data; AI only words why.
- Not planned: letting the model produce the forecast line, pick the safety threshold or the
  overdraft mode.

## 8. Receipt line items

**Why:** a receipt photo becomes the split, instead of typing amounts.

- Receipts already attach to a transaction (`/api/receipts`). Add "Read receipt": the image goes
  to Gemini (multimodal) and comes back as `{ merchant, date, total, lines: [{ text, amount,
  categoryId? }] }`, validated against the transaction total.
- Show the lines as a proposed split in the existing split dialog; the user adjusts and saves.
- Image stays local except for that one call; no OCR text is stored unless the split is saved.

## 9. Payday check-in

**Why:** a short "what's ahead this month" right when the salary lands.

- Trigger: Home, once per financial month, when the income recurring item for this month is
  paid (`getBillStatuses`, type income).
- Input: bills and plan parts still due (`getBillStatuses`), forecast verdict and low point
  (`getCashFlowForecast`, `judgeForecast` — includes overdraft), budget left.
- Output: 2–3 sentences + one suggestion. Dismissible card; cache per month.
- Pairs with the notification system once it exists (push the first sentence).

## 10. Import column mapping

**Why:** an unknown CSV layout today means mapping columns by hand.

- When no import profile matches (`src/lib/import-profiles.ts`), send the header row and three
  redacted sample rows; get back `{ date, amount, description, account?, direction? }` column
  guesses plus the date and decimal format. Prefill `import-column-mapping.tsx`; the user confirms.

## 11. Ask Centje (question → filter)

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
- AI-computed forecasts, balances or totals (see item 7).
- Rule matching itself: rules stay deterministic so they run on import, offline and for free.
