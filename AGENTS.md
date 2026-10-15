<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Page layout rule (redesign)

Page content must never set its own max width or centre itself (`mx-auto max-w-*`).
The app shell puts a 240px sidebar on the left from `lg` and pages fill all the
remaining width at every screen size, with no cap. Use the shared
primitives in `src/components/page-container.tsx`:

- `<PageShell header={…}>` for every page (phone 20px gutters; desktop 84px header row,
  36px side padding, `4px 36px 36px` content padding, 20px between sections).
- `SPLIT_GRID` (right column one third, min 380px) or `SPLIT_GRID_WIDE` (two fifths,
  min 460px, for a detail panel beside a list) for two-column desktop pages. Never a
  fixed-width right column: on 1920px screens it leaves the main column stretched.
- `PAGE_COLUMN` for in-flow elements, `FULLSCREEN_OVERLAY` for `fixed inset-0`
  page-like overlays, `SHEET_COLUMN` / `SHEET_FIXED` for sheets, dialogs, tips and
  docked bars.

Desktop layouts are multi-column grids (a main column plus a 380–460px right column),
not one stretched column.

# Corner radius rule (redesign)

We don't use fully round corners on cards, banners, tips, tiles or rows. Use the radius
tokens (Tailwind utilities from `src/app/globals.css`):

- `rounded-card` (18px) — cards and panels.
- `rounded-banner` (16px) — banners, nudges, tips, inline notices and link tiles.
- `rounded-tile` (12px) — tiles inside a card (stat chips, summary boxes).
- `rounded-row` (12px) — list-row hover/active/selected backgrounds, menu items and
  sidebar nav items.

`rounded-full` is only for buttons, chips, pills and badges, avatars, round icons,
toggles and segmented controls, progress bars, and the floating tab bar and add button.
