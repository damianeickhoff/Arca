---
title: AI
description: Optional category suggestions, written summaries and receipt scanning, with your own free Gemini key or an AI server on your own network.
---

Arca can use AI for a few helpful extras. It's completely optional and **off** until you set it up and switch it on. You pick **one** provider for the whole app:

- **Google Gemini**: Google's AI, with your own free API key.
- **Local server**: an AI server you run yourself, on your own network (Ollama, LM Studio, llama.cpp, vLLM, LocalAI, Open WebUI or anything else that speaks the OpenAI API). Nothing goes to the internet.

## What it does today

- **Category suggestions** in [Needs a category](/Arca/everyday/needs-a-category/#ask-ai): **Ask AI** suggests a category for the transaction in front of you and the next ones in the queue. The pick is marked; you still choose.
- **A written summary** on [Insights → Overview](/Arca/insights/overview/#summary): **Write with AI** turns the period's facts into a few plain sentences with a budgeting tip.
- **Receipt scanning** (see [below](#receipt-scanning)): always on your own server, never on Gemini.

More ideas are on the [roadmap](/Arca/roadmap/).

## Ground rules

<div class="hero-card">
  <p class="hero-card__label">AI explains, the app computes</p>
  <p class="hero-card__value">Every number you see comes from Arca itself.</p>
  <p>The AI writes sentences and picks from your own categories. It never makes up an amount, a balance or a date. And it never saves anything without you choosing it. This holds for both providers.</p>
</div>

## What is sent, and what never is

When you use an AI feature, Arca sends only what that feature needs, and only when you tap the button. It goes to the provider you chose: Google, or the address of your own server.

**For category suggestions**: the description of each transaction (cleaned up: account numbers, card numbers and long reference numbers are stripped, and it's cut short), its amount, whether money came in or went out, and the names of your categories.

**For the summary**: the period's dates and totals (income, spending, saved, what's left per day), your biggest categories with their budgets, and your top merchants with what you spent there.

**Never sent**: account numbers (IBANs), account balances, your name or email address, or your whole transaction history.

:::caution[Gemini's free tier]
On Gemini's free tier, Google may use what's sent to improve its products. If that's not okay for you, use a local server or leave AI off: everything else in Arca works without it.
:::

Keys are stored on your own server and never sent back to the browser.

## Use Google Gemini

1. Get a free API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In Arca, open Settings → **AI**, choose **Google Gemini** at the top and paste the key into **Gemini API key**.
3. Leave **Model** on **Automatic (a Flash model)**: Flash models have the most generous free tier.
4. Choose **Test connection**. When Gemini answers, choose **Save**.
5. Switch on **Use AI features**.

To stop, switch it off again, or **Remove key** (this also switches AI off).

## Use your own server

Any server with an OpenAI-compatible API works. Arca talks to it from **its own server**, so the address must be reachable from the machine (or Docker container) Arca runs on, not just from your browser.

### With Ollama

1. Install [Ollama](https://ollama.com) on a machine in your network and download a model, for example `ollama pull llama3.1:8b` (or `qwen2.5:7b`).
2. Let Ollama listen on your network, not only on its own machine: set the environment variable `OLLAMA_HOST=0.0.0.0` for the Ollama service and restart it. Ollama uses port **11434**.
3. In Arca, open Settings → **AI** and choose **Local server**. Enter the address, for example `http://192.168.1.20:11434`.
4. Choose **Load models** and pick the model, then **Test connection**. When it answers, choose **Save** and switch on **Use AI features**.

### With LM Studio

1. In [LM Studio](https://lmstudio.ai), download a model and load it.
2. Open the **Developer** tab, switch on **Serve on Local Network** and start the server. LM Studio uses port **1234**.
3. In Arca, choose **Local server** and enter the address, for example `http://192.168.1.20:1234`. Then **Load models**, pick the model, **Test connection**, **Save**.

### Good to know

- You can enter the address with or without `/v1` at the end; Arca adds it when it's missing.
- Leave **API key** empty unless your server asks for one (Ollama and LM Studio don't by default; Open WebUI and some vLLM setups do).
- Which model? A model of **7B or more** follows the answer format reliably; smaller ones may need a retry. When an answer doesn't fit, Arca asks once more and tells the model what was wrong, so a small model may just be slower.
- A local model on a CPU can take tens of seconds per answer. Arca waits up to a minute.
- If the model list won't load (some servers don't offer one), type the model name instead.

## Receipt scanning

**Scan receipt** (on Home, in Activity and when adding a transaction) reads the merchant, amount and date from a photo. It always runs on your own server's **vision model**, whichever provider writes the text: receipt photos never go to Google.

1. Download a vision model on your server, for example `ollama pull llava` or `ollama pull qwen2.5vl`.
2. In Settings → **AI**, choose **Local server**, enter the address and pick it under **Vision model**. Choose **Save**.
3. If you use Gemini for the text, switch back to **Google Gemini** afterwards and save again: the vision model stays set.

The **Scan receipt** buttons only show up while a vision model is set. To stop scanning, set **Vision model** back to **None**.

:::note[Set up with OLLAMA_HOST before?]
Older versions set receipt scanning with the `OLLAMA_HOST` and `OLLAMA_VISION_MODEL` environment variables. Arca still reads them to fill in the address and the vision model until you save these fields in Settings → AI, so an existing setup keeps working. Once saved, the settings win.
:::

## If something goes wrong

| Message | What it means |
| --- | --- |
| Today's free-tier limit for this model is used up | Gemini: it resets tomorrow, or pick another model. |
| Too many requests in a short time | Wait a minute and try again. |
| Google didn't accept this key or model | Check the key in Google AI Studio. |
| This model isn't on the free tier for your key | Choose **Automatic** or another Flash model. |
| Couldn't reach the server at this address | Local server: check that it runs, listens on your network (not only `localhost`) and that Arca's server can reach the address. Inside Docker, `localhost` is the Arca container itself. |
| The server doesn't have this model | Choose **Load models** and pick one, or download it first (`ollama pull …`). |
| The model didn't answer in the format Arca needs | Try again, or use a bigger model (7B or more). |
