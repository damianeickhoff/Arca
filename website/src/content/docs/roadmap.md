---
title: Roadmap
description: Where Arca is heading. A direction, not a promise.
subtitle: "Where Arca is heading. A direction, not a promise: items move, change shape or get dropped."
titleAction:
  text: Suggest an idea
  link: https://github.com/damianeickhoff/Arca/issues
tableOfContents: false

# How this page is built (styles: src/styles/roadmap.css)
#
# Everything below sits inside <div class="rm not-content">. To add an item, copy a tile
# into the right column. Start each tile's opening tag at the beginning of a line (no
# indentation) and leave no blank lines inside a tile. The count next to each column
# title is worked out by the page itself.
#
# A column (id: now, next, later or not-planned):
#   <section class="rm-col" id="now">
#   <h2>Now</h2>
#   ...tiles, a blank line between them...
#   </section>
#
# A tile in Now, Next or Later:
#   <div class="rm-tile">
#     <span class="rm-area rm-area--ai">AI</span>
#     <h3>Title</h3>
#     <p>One plain sentence.</p>
#     <p class="rm-meta">In progress · Oct 2026</p>
#   </div>
#
#   Area chips: rm-area--ai (AI), rm-area--banking (Banking), rm-area--app (App),
#   rm-area--guide (Guide).
#   Meta line: Now items say when, as above. Next items use
#     <p class="rm-meta">Planned <a href="https://github.com/damianeickhoff/Arca/issues">Vote</a></p>
#   Later items have no meta line.
#
# A tile in Not planned: no area chip and no meta line (the column draws it dashed).
#   <div class="rm-tile">
#     <h3>Title</h3>
#     <p>Why not.</p>
#   </div>
#
# The landing page's "Where Arca is heading" card (src/components/RoadmapTeaser.astro)
# reads the columns and tiles from this file, so it follows along by itself.
---

<div class="rm not-content">

<div class="rm-shipped">
  <span class="rm-shipped__chip">Just shipped · 1.4.0</span>
  <ul class="rm-shipped__items">
    <li>Bank connection</li>
    <li>Recent changes with undo</li>
    <li>Add anything from anywhere</li>
    <li>The Arca guide</li>
  </ul>
  <a class="rm-shipped__link" href="https://github.com/damianeickhoff/Arca/releases/latest">Release notes</a>
</div>

<div class="hero-card rm-hero">
  <div class="rm-hero__copy">
    <p class="hero-card__label">How AI fits in</p>
    <h2 class="rm-hero__title">AI explains. Arca computes.</h2>
    <p class="rm-hero__text">Every number on screen comes from Arca itself. The model writes sentences and picks from your own lists. Each feature below keeps these rules.</p>
  </div>
  <ul class="rm-hero__rules">
    <li><h3>Opt-in, per feature</h3><p>Off until you add a key. Every feature has its own switch.</p></li>
    <li><h3>The minimum leaves your server</h3><p>Cleaned descriptions, amounts, dates, category names. Never account numbers.</p></li>
    <li><h3>You confirm</h3><p>Nothing is saved without a tap.</p></li>
    <li><h3>Works without it</h3><p>Every screen keeps working with AI off.</p></li>
  </ul>
</div>

<div class="rm-board">

<section class="rm-col" id="now">
<h2>Now</h2>

<div class="rm-tile">
  <span class="rm-area rm-area--ai">AI</span>
  <h3>AI picks become rules</h3>
  <p>File a merchant with the AI's suggestion and Arca offers the rule straight away, so next month it's sorted without asking again.</p>
  <p class="rm-meta">In progress · Oct 2026</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--banking">Banking</span>
  <h3>Bank connection, round two</h3>
  <p>Reconnect reminders before a consent runs out, and a sync log you can read.</p>
  <p class="rm-meta">In progress · Oct 2026</p>
</div>

</section>

<section class="rm-col" id="next">
<h2>Next</h2>

<div class="rm-tile">
  <span class="rm-area rm-area--ai">AI</span>
  <h3>Ask AI during import</h3>
  <p>Category suggestions for new merchants while you check an import, before anything lands in Needs a category.</p>
  <p class="rm-meta">Planned <a href="https://github.com/damianeickhoff/Arca/issues">Vote</a></p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--ai">AI</span>
  <h3>The forecast in words</h3>
  <p>Two plain sentences about what's coming, while the forecast and its warnings stay calculated by Arca.</p>
  <p class="rm-meta">Planned <a href="https://github.com/damianeickhoff/Arca/issues">Vote</a></p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Notifications</h3>
  <p>A heads-up for upcoming bills, a shortfall in the forecast and the payday check-in, by push notification or email.</p>
  <p class="rm-meta">Planned <a href="https://github.com/damianeickhoff/Arca/issues">Vote</a></p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Smarter recurring detection</h3>
  <p>Bills found by their rhythm, not by their name, as proposals you accept.</p>
  <p class="rm-meta">Planned <a href="https://github.com/damianeickhoff/Arca/issues">Vote</a></p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--banking">Banking</span>
  <h3>More banks and countries</h3>
  <p>More banks in the bank connection, and more countries than the Netherlands.</p>
  <p class="rm-meta">Planned <a href="https://github.com/damianeickhoff/Arca/issues">Vote</a></p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--guide">Guide</span>
  <h3>Dutch documentation</h3>
  <p>This guide in Dutch too.</p>
  <p class="rm-meta">Planned <a href="https://github.com/damianeickhoff/Arca/issues">Vote</a></p>
</div>

</section>

<section class="rm-col" id="later">
<h2>Later</h2>

<div class="rm-tile">
  <span class="rm-area rm-area--ai">AI</span>
  <h3>Receipt line items</h3>
  <p>Read a receipt photo into separate lines, so a supermarket receipt becomes a split, ready for you to check.</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--ai">AI</span>
  <h3>Ask Arca</h3>
  <p>Ask a question in your own words; Arca does the counting itself and shows the transactions behind the answer.</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Budget rollover</h3>
  <p>What's left in a category, or what you overspent, carries over into next month.</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Year in review</h3>
  <p>A look back at your year: where the money went, what changed and what you saved.</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Automatic backups</h3>
  <p>From Settings, on a schedule, to a folder of your choice.</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Household views per person</h3>
  <p>Who spent what, and personal budgets next to the shared ones.</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Widgets and shortcuts</h3>
  <p>Safe to spend and quick add on your phone's home screen.</p>
</div>

<div class="rm-tile">
  <span class="rm-area rm-area--app">App</span>
  <h3>Investments in net worth</h3>
  <p>Follow the value of your investments over time.</p>
</div>

</section>

<section class="rm-col" id="not-planned">
<h2>Not planned</h2>

<div class="rm-tile">
  <h3>A free-form AI chat over all transactions</h3>
  <p>Too much data leaving your server, and too much for a free key.</p>
</div>

<div class="rm-tile">
  <h3>AI-made budgets or investment advice</h3>
  <p>Wrong answers here cost real money.</p>
</div>

<div class="rm-tile">
  <h3>AI-calculated totals or forecasts</h3>
  <p>These stay calculated by Arca, so they're exact, work offline and cost nothing.</p>
</div>

<div class="rm-tile">
  <h3>AI deciding your rules</h3>
  <p>Rules stay predictable, so they run on every import, offline and for free.</p>
</div>

<div class="rm-tile rm-ask">
  <h3>Missing something?</h3>
  <p>Ideas and votes live on GitHub.</p>
  <a class="arca-pill arca-pill--primary arca-pill--sm" href="https://github.com/damianeickhoff/Arca/issues">Open an issue</a>
</div>

</section>

</div>

</div>
