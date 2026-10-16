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

Status: the Clear tokens (`src/app/globals.css`, `clear-*` utilities), the shared
components (`src/components/clear/`), the app shell (sidebar + phone tab bar), Home,
Activity, Plan (Budget, Debts, Goals and their dialogs), Insights (all five tabs), the
Settings page and the popups (add transaction, split, link, rule, receipt, pickers, search,
merchant/category/recurring details, account and import dialogs) are on Clear. Still on the old mustard design: the inner forms of several
Settings panels, the phone SettingsDialog chrome, Upcoming (bills calendar), Needs review,
Import, onboarding and auth. They keep working until migrated. The shared Dialog
(`components/ui/dialog.tsx`) is a centred modal from lg and a bottom sheet on phones.
New UI is Clear only — never build new UI with the mustard tokens
(`bg-surface`, `text-ink`, `bg-mustard`, `rounded-card`, `mono-label`, …).

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
  progress bars, the floating tab bar and the add button.
- Shadows: none on cards; `shadow-clear-dialog` for dialogs and popovers,
  `shadow-clear-float` for the tab bar and toasts.
- Fills: `clear-hatch` (diagonal stripes).

## Components (`src/components/clear/`) — use these before writing markup

`ClearButton` (client) / `clearButtonVariants` (`button-variants.ts`, usable on the server) (primary, secondary, surface, ember, outline,
danger, ghost), `ClearCard` (+ `hero`), `ClearCardHeader`, `ClearCardLink`, `ClearTile`,
`StatTile`, `ClearChip`, `DeltaChip`, `StatusDot`, `IconTile`, `Amount`,
`ClearProgress`, `Segmented`, `ListRow`, `ClearSwitch`, `ClearInput`, `ClearField`,
`ClearDialogPanel` / `ClearDialogHeader` / `ClearDialogFooter`, `ResponsivePopover` (desktop popover,
phone sheet), `useConfirm()` from `confirm-dialog.tsx` (never `window.confirm`), tones in `tones.ts`.
Components take already translated strings (labels, aria-labels) as props; they never
contain user-facing text themselves.

## Layout

- Desktop (`lg`+): a floating white sidebar (260px, 16px from the window edges, card
  radius) with the logo, the signed-in user, the "Search everything" field (the global
  search, also Ctrl/Cmd+K), the navigation (Home · Activity · Plan ·
  Insights, active row black; Plan shows Budget · Debts · Goals under it while one is
  open, Insights its five tabs while it is open) and Import CSV, Settings, the theme and Sign out at the bottom. Pages start 276px
  from the left (MainContent) with `28px 32px 48px` padding: a heading row (40px title,
  subtitle, actions), then the cards, 20px apart. Pages never add their own global search
  button — search lives in the shell so it never reads as "search this page" (a page
  may have a search that filters its own list, like Activity).
- Phone: header (avatar/title + round buttons), content in 16px gutters, and the
  floating black tab bar (Home, Activity, ember add button, Plan, Insights, and the
  global search button set apart at the end). Pages
  reserve space at the bottom so the last row clears the tab bar.
- Pages fill the available width; content never sets its own max width or centres
  itself (`mx-auto max-w-*`), except single-card pages (sign-in, errors) and dialogs.
- Multi-column pages put all their cards in ONE grid so columns line up from row to
  row (Home: `lg:grid-cols-2 xl:grid-cols-3`, a card or stacked column spanning
  `xl:col-span-2` where it needs the width). Cards in a row stretch to the same height;
  a card that would look empty when stretched gets a flexible element (a chart) that
  fills the space. Never a fixed-width column. Wide tables scroll inside their card.
- Plan pages show a Budget · Debts · Goals `Segmented` (links) under the heading;
  Insights pages show the Overview · Trends · Net worth · Forecast · Health tab row.
- Dialogs: a centred modal on desktop, sized to its content (520–800px wide, as tall as
  needed up to the window, the body scrolling inside beyond that) and a bottom sheet on
  phones. Never give a dialog a fixed width or height that can cut text off. Menus and pickers are popovers anchored to their trigger.
- Empty states keep the page shell and show a simple shape illustration, one sentence,
  a primary action and, where useful, dashed placeholders — never fake numbers.
