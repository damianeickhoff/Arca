---
title: AI (Gemini)
description: Optional category suggestions and written summaries, using your own free Gemini key.
---

Arca can use Google's **Gemini** for a few helpful extras. It's completely optional and **off** until you add your own key and switch it on.

## What it does today

- **Category suggestions** in [Needs a category](/Arca/everyday/needs-a-category/#ask-ai): **Ask AI** suggests a category for the transaction in front of you and the next ones in the queue. The pick is marked; you still choose.
- **A written summary** on [Insights → Overview](/Arca/insights/overview/#summary): **Write with Gemini** turns the period's facts into a few plain sentences with a budgeting tip.

More ideas are on the [roadmap](/Arca/roadmap/).

## Ground rules

<div class="hero-card">
  <p class="hero-card__label">AI explains, the app computes</p>
  <p class="hero-card__value">Every number you see comes from Arca itself.</p>
  <p>The AI writes sentences and picks from your own categories. It never makes up an amount, a balance or a date. And it never saves anything without you choosing it.</p>
</div>

## What is sent, and what never is

When you use an AI feature, Arca sends only what that feature needs, and only when you tap the button.

**For category suggestions**: the description of each transaction (cleaned up: account numbers, card numbers and long reference numbers are stripped, and it's cut short), its amount, whether money came in or went out, and the names of your categories.

**For the summary**: the period's dates and totals (income, spending, saved, what's left per day), your biggest categories with their budgets, and your top merchants with what you spent there.

**Never sent**: account numbers (IBANs), account balances, your name or email address, or your whole transaction history.

:::caution[The free tier]
On Gemini's free tier, Google may use what's sent to improve its products. If that's not okay for you, leave AI off: everything else in Arca works without it.
:::

Your key is stored on your own server and never sent back to the browser.

## Switch it on

1. Get a free API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In Arca, open Settings → **AI** and paste it into **Gemini API key**.
3. Leave **Model** on **Automatic (a Flash model)**: Flash models have the most generous free tier.
4. Choose **Test connection**. When Gemini answers, choose **Save**.
5. Switch on **Use AI features**.

To stop, switch it off again, or **Remove key** (this also switches AI off).

## If something goes wrong

| Message | What it means |
| --- | --- |
| Today's free-tier limit for this model is used up | It resets tomorrow, or pick another model. |
| Too many requests in a short time | Wait a minute and try again. |
| Google didn't accept this key or model | Check the key in Google AI Studio. |
| This model isn't on the free tier for your key | Choose **Automatic** or another Flash model. |
