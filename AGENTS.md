<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Page layout rule (redesign)

Page content must never set its own max width or centre itself (`mx-auto max-w-*`).
The app shell puts a 240px sidebar on the left from `lg` and pages fill all the
remaining width, left-aligned (capped at 1600px only on `2xl`). Use the shared
primitives in `src/components/page-container.tsx`:

- `<PageShell header={…}>` for every page (phone 20px gutters; desktop 84px header row,
  36px side padding, `4px 36px 36px` content padding, 20px between sections).
- `PAGE_COLUMN` for in-flow elements, `FULLSCREEN_OVERLAY` for `fixed inset-0`
  page-like overlays, `SHEET_COLUMN` / `SHEET_FIXED` for sheets, dialogs, tips and
  docked bars.

Desktop layouts are multi-column grids (a main column plus a 380–460px right column),
not one stretched column.
