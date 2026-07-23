# App TODO


## Mobile Navigation / UI Transitions

- [ ] Add left-to-right transition animation when switching pages from the mobile navbar.
  - Animate the active icon background/pill movement.
  - Keep the animation smooth and consistent with the existing design.

- [ ] Hide the mobile bottom navigation bar from the category detail portal overlay.

- [ ] Hide scrollbars throughout the app where appropriate while keeping scrolling functional.

---

## General UI / Animations

- [ ] Improve glass animations:
  - More fluid blur/transparency transitions
  - Smoother opening/closing animations for dialogs and portals
  - More 'icon merge' animations by opening different icons.

- [ ] Redesign and improve the login page and onboarding pages styling. Give it a more modern and professional finance app style. See attached image, but use the blue color style from the main dashboard instead of the green.

- [ ] Remove the shadow effect from the back button on the Budget Portal page.

---

## Transaction Improvements

### Add Transaction

- [ ] Create a reusable custom numeric keyboard component.
  - Move the existing new transaction keyboard into this component.
  - Reuse it in:
    - Add transaction dialog
    - Add budget dialog
    - Future numeric input dialogs

- [ ] Add "Internal transaction" as an option at the top of the Add Transaction dialog. See screenshot for style.

- [ ] Change the pill-style UI in the Add Transaction dialog to the same we use for the month/week in the Add budget dialog.

### Transaction Review

- [ ] Fix review page back button:
  - Currently 90% outside of the viewport area.

- [ ] Optimize review transactions page:
  - Large amounts of reviewed transactions make the page slow.
  - Improve rendering/performance.

### Transaction Page

- [ ] Fix spacing between transactions:
  - Match spacing used in Recent Transactions.

- [ ] Fix transaction page header layout. Its showing the default #171717 color.

---

## Receipt Scanner

- [ ] Add receipt scanning functionality.
  - Scan receipt image.
  - Automatically create transaction fields:
    - Name
    - Category
    - Amount
    - Date
  - Allow user review/edit before saving.
  - Add a button for it on the 'add transaction' page next to the date picker.

---

## New Features

### Conversion Tool

- [ ] Add a currency conversion tool inside the app. Open it as a dialog and let the user add multiple currencies that gets calculated at the same time. Add the icon to the main dashboard header. 

---

## Dashboard

- [ ] Accounts card:
  - Clicking the card should directly open the Accounts Portal.
  - Currently opens through the Settings menu portal.

---

## Budget

- [ ] The Add Budget Dialog has the right keypad, but is missing the numeric animations

---

## Reports

- [ ] Redesign the Reports page. See attached images.

---

## Debts

- [ ] Add optional initial debt amount.
  - Allows showing:
    - Original debt amount
    - Amount already paid
    - Remaining debt

  - If no initial debt is provided:
    - Keep current behavior.
    - Calculate based on the starting balance.

---

## Performance / Cleanup

- [ ] Review large lists and portals for unnecessary rendering.
- [ ] Improve animations and transitions where possible without impacting performance.