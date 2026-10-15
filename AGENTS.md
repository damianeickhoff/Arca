<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Clear design system (the redesign target)

The app is being redesigned to the "Clear" concept. The visual source of truth is the
concept canvas (https://claude.ai/artifact/VSuxXsBfVf8NP2o3zxnvzB): every page, phone
screen, dialog, empty state and the dark Home are drawn there. Match it; when a screen
has no mockup, build it from the tokens and components below and follow the closest
drawn screen.

Status: the Clear tokens (`src/app/globals.css`, `clear-*` utilities) and shared
components (`src/components/clear/`) exist; screens have not been migrated yet. Screens
that are still on the old mustard design keep working until they are migrated. New UI is
Clear only — never build new UI with the mustard tokens (`bg-surface`, `text-ink`,
`bg-mustard`, `rounded-card`, `mono-label`, …).

## Delete what you replace

When a page, component, token, utility, translation key or helper is replaced by its
Clear version, delete the old one in the same change. Grep for remaining users first;
when the last user of a legacy token (`--arca-*`, the mustard `--color-*` mappings,
`rounded-card`/`rounded-banner`/`rounded-tile`/`rounded-row`, `amount`, `heading`,
`mono-label`, `PageShell`, `SPLIT_GRID*`, the 240px sidebar) is gone, remove it from
`globals.css` / its file too. Never leave two versions of the same thing behind.

## Look

- Light grey page ground, borderless white cards (no shadows on cards), one black
  "hero" card per page for the answer (Safe to spend), one ember-orange accent used
  only where something needs attention, pastel tiles and chips, black pill buttons,
  hatched bars for "still available / projected".
- Font: Plus Jakarta Sans (`font-clear`). Money: `clear-amount` (800, tabular) or the
  `<Amount>` component (sign first, cents at half size). Page title 40px/800 (phone
  26px), card title 18px/700, body 15px, smallest text anywhere 12px. Labels are plain
  sentence case — no small uppercase mono captions.
- Text on an ember fill is always ink (`text-clear-ember-ink`), never white. Orange
  text on a card uses `text-clear-ember-text`.
- Dark mode is token-driven (`.dark` redefines `--clr-*`): the hero inverts to a light
  card and primary buttons turn light. Never hard-code a hex colour in a component —
  use the `clear-*` colour utilities so both themes work.

## Tokens (Tailwind utilities from `src/app/globals.css`)

- Colours: `clear-ground`, `clear-card`, `clear-tile`, `clear-line`, `clear-ink`,
  `clear-ink-2`, `clear-muted`, `clear-placeholder`, `clear-hero` / `clear-hero-ink` /
  `clear-hero-ink-2`, `clear-primary` / `clear-primary-ink`, `clear-ember` /
  `clear-ember-ink` / `clear-ember-text`, pastels `clear-{mint,peach,sky,lilac,butter,rose,stone}`
  each with `-ink`, semantic `clear-{positive,negative,warning,info}` (text) with `-fill`.
- Radius: `rounded-clear-card` (24px, cards and panels), `rounded-clear-dialog` (28px,
  dialogs, sheets, the auth card), `rounded-clear-tile` (16px, tiles inside cards,
  banners, notices), `rounded-clear-row` (14px, list-row highlight, menu items, inputs,
  table header), `rounded-clear-icon` (12px, icon tiles). `rounded-full` only for buttons,
  chips, pills, badges, avatars, round icon buttons, toggles, segmented controls,
  progress bars, the top nav pills, the floating tab bar and the add button.
- Shadows: none on cards; `shadow-clear-dialog` for dialogs and popovers,
  `shadow-clear-float` for the tab bar and toasts.
- Fills: `clear-hatch` (diagonal stripes).

## Components (`src/components/clear/`) — use these before writing markup

`ClearButton` / `clearButtonVariants` (primary, secondary, surface, ember, outline,
danger, ghost), `ClearCard` (+ `hero`), `ClearCardHeader`, `ClearCardLink`, `ClearTile`,
`StatTile`, `ClearChip`, `DeltaChip`, `StatusDot`, `IconTile`, `Amount`,
`ClearProgress`, `Segmented`, `ListRow`, `ClearSwitch`, `ClearInput`, `ClearField`,
`ClearDialogPanel` / `ClearDialogHeader` / `ClearDialogFooter`, tones in `tones.ts`.
Components take already translated strings (labels, aria-labels) as props; they never
contain user-facing text themselves.

## Layout

- Desktop (`lg`+): a top bar — logo pill left, pill navigation centre (Home · Activity
  · Plan · Insights, active item black), search and the avatar chip right — then a page
  heading row (40px title, subtitle, actions). No sidebar. Page padding `24px 32px 48px`,
  28px between the top bar, heading and content, 20px between cards.
- Phone: header (avatar/title + round buttons), content in 16px gutters, and the
  floating black tab bar (Home, Activity, ember add button, Plan, Insights). Pages
  reserve space at the bottom so the last row clears the tab bar.
- Pages fill the available width; content never sets its own max width or centres
  itself (`mx-auto max-w-*`), except single-card pages (sign-in, errors) and dialogs.
- Multi-column pages are flex rows that wrap: main column `flex: 2 1 640px`, side
  column `flex: 1 1 380px`, both `min-w-0`; card grids use
  `repeat(auto-fit, minmax(<n>px, 1fr))`. Never a fixed-width column. Wide tables
  scroll inside their card.
- Plan pages show a Budget · Debts · Goals `Segmented` (links) under the heading;
  Insights pages show the Overview · Trends · Net worth · Forecast · Health tab row.
- Dialogs: a centred modal (`ClearDialogPanel`, 520–640px wide) on desktop and a
  bottom sheet on phones. Menus and pickers are popovers anchored to their trigger.
- Empty states keep the page shell and show a simple shape illustration, one sentence,
  a primary action and, where useful, dashed placeholders — never fake numbers.
