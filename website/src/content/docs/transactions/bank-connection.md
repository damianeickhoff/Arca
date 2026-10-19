---
title: Bank connection
description: Let your transactions come in by themselves every day, through Enable Banking.
---

With a bank connection, Arca fetches your transactions straight from your bank every day. No more exporting CSV files.

## How it works

Arca talks to your bank through **Enable Banking**, a licensed European service that gives apps read-only access to bank accounts, with your permission (this is what the European PSD2 rules are for).

- **It's free for your own accounts.** You create a free Enable Banking account and register a small "app" for yourself. Because it only reads accounts you link yourself, there's no contract and no cost.
- **Read-only.** Arca can see balances and transactions. It can never move money.
- **You give permission at your bank**, in your bank's own app or website. That permission lasts up to **180 days**; after that you renew it with one tap.
- **Your keys stay on your server.** The key you get from Enable Banking is stored by Arca and never sent back to your browser.

### Which banks

Dutch banks such as **ING, ABN AMRO, Rabobank, ASN Bank, RegioBank, SNS, Triodos Bank** and **Van Lanschot**. When you connect, Arca shows the full list Enable Banking offers for the Netherlands; some are marked **Beta**.

Not covered: **bunq**, and ABN AMRO credit cards. For those, keep using [CSV import](/Arca/transactions/csv-import/).

## Before you start: your redirect address

Enable Banking asks for a **redirect URL** when you register your app. Here's what that means in plain words: after you give permission at your bank, your browser needs to know where to go back to. That's your own Arca, at a fixed page.

Take the address you type to open Arca and add `/api/bank/callback`:

| You open Arca at | Your redirect URL |
| --- | --- |
| `https://arca.example.com` | `https://arca.example.com/api/bank/callback` |
| `https://finance.mydomain.nl` | `https://finance.mydomain.nl/api/bank/callback` |

It has to match exactly, including `https://` and any port number. You can add more than one if you open Arca at different addresses.

:::caution[Your Arca needs an https address]
Enable Banking only accepts redirect addresses that start with `https://`. If you open Arca at a plain `http://192.168.…` address at home, set up a reverse proxy with HTTPS first (see [Install](/Arca/getting-started/install/#opening-arca-from-outside-your-home)), and open Arca at that address when you connect.
:::

## Step 1: create your Enable Banking account

1. Go to [enablebanking.com](https://enablebanking.com/sign-in/) and enter your email address. There's no separate sign-up: your first sign-in creates the account.
2. Open the link in the email you receive. You land in the **Control Panel**.
3. Optional, but a good idea: add your phone number under **Profiles** for an extra sign-in step.

## Step 2: register your app

1. In the Control Panel, open **API applications** and add a new application.
2. **Environment**: choose **Production** (the real banks). *Sandbox* is a test environment with a fake bank, only useful if you want to try things out first.
3. **Key**: choose **generate in browser**.
4. **Name**: anything you like, for example "Arca at home".
5. **Redirect URLs**: your redirect address from above.
6. Production also asks for a short description, a contact email, and links to a privacy policy and terms. For a personal app this is just a formality: a page on your own domain, or the [Arca repository](https://github.com/damianeickhoff/Arca), is fine.
7. Choose **Register**.

Two things now happen: your app gets an **application ID** (a long code like `3f2b8c1e-…`), and your browser downloads a **private key** file ending in `.pem`.

:::danger[Keep the .pem file safe]
The private key can't be downloaded again, and anyone who has it together with your application ID can read the accounts you linked. Store it like a password, for example in your password manager.
:::

## Step 3: activate it with your own accounts

Your new app starts as **Inactive**. To switch it on:

1. Open the app in the Control Panel and choose **Activate by linking accounts**.
2. You're sent to your bank. Confirm in your bank's app (ING, ABN AMRO, Rabobank…), or scan the QR code on a computer.
3. Accept the terms. The app now says **Active (restricted)**: it can read only the accounts you just linked, which is exactly what you want.
4. Repeat for every bank you want in Arca.

## Step 4: connect Arca

1. In Arca, open **Import** in the sidebar (on a phone: Settings → Import). The **Bank connection** card is at the top.
2. Paste your **Application ID**.
3. Open the `.pem` file in a text editor (Notepad, TextEdit) and copy **everything**, including the `BEGIN` and `END` lines. Paste it into **Private key**.
4. Choose **Test**. When it says "It works", choose **Save**.
5. Choose **Connect a bank**, search for your bank and pick it.
6. Confirm at your bank. You come back to Arca automatically.
7. **Link accounts**: for each account the bank shared, choose which account in Arca it belongs to, **New account from this one**, or **Don't sync**. Accounts whose IBAN Arca already knows are linked for you.
8. Choose **Save and sync**.

Your transactions come in, go through your [rules and merchants](/Arca/transactions/rules-and-merchants/), and anything new lands in [Needs a category](/Arca/everyday/needs-a-category/).

:::tip[Older history]
Banks usually share about the last 90 days on the first sync. [Import a CSV](/Arca/transactions/csv-import/) for anything older; Arca recognises the overlap and won't count anything twice.
:::

## The daily sync

While Arca is running, it syncs every connected bank **once a day** by itself. Each sync also looks back a week, to pick up payments your bank booked late. You can always choose **Sync now** for one bank or **Sync all**.

The sidebar shows when your banks last synced, under **Import**.

Banks only allow a few syncs a day without you present. If you see "The bank allows only a few syncs a day", just try again later.

## Reconnect when the permission runs out

After up to 180 days, your bank's permission ends. The bank then shows **Consent expired** in Arca, and the sidebar says so too.

Choose **Reconnect**, confirm at your bank again, and you're done. Your account links and everything already imported stay as they are.

## Disconnect a bank

Choose **Disconnect** on the bank's card. Arca stops syncing and closes the permission. Transactions already imported stay.

## Something went wrong?

| Message | What to do |
| --- | --- |
| That private key can't be read | Paste the whole `.pem` file again, `BEGIN` and `END` lines included. |
| Enable Banking refused the application ID or key | Check that the ID and the key belong to the same app. |
| Enable Banking didn't accept the request | The address you opened Arca at isn't one of your app's redirect URLs. Add it in the Control Panel, or open Arca at the address you registered. |
| The bank didn't give access | You cancelled or something failed at the bank. Choose **Connect a bank** again. |
| An import or sync is running | Wait until the other import or sync is finished. |
