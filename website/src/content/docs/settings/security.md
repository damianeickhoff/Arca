---
title: Sign-in and security
description: Your profile, password, two-factor sign-in, the app lock and the people in your household.
---

Everything about who can get into Arca, and how.

## Profile

Settings → **Profile**: your photo, your name and the email address you sign in with.

## Password and two-factor sign-in

Settings → **Password & 2FA**.

- **Change your password**: enter your current one and a new one of at least 8 characters.
- **Two-factor sign-in**: after your password, Arca asks for a 6-digit code from an authenticator app on your phone. Choose **Set up**, scan the QR code (or type the key by hand), enter the code and choose **Turn on**.
- **Backup codes**: when you turn it on you get ten backup codes. Each one signs you in once if you don't have your phone. Keep them somewhere safe. **Make new codes** replaces them; the old ones then stop working.
- **Turn off** needs your current password.

When you sign in, **Keep me signed in** keeps you signed in for 30 days on that device. Without it, you're signed out when you close the browser.

:::caution[Forgot your password?]
There's no "forgot password" email yet. Keep your password in a password manager. If you're locked out, ask for help on [GitHub](/Arca/help/get-help/).
:::

## App lock

Settings → **App lock** asks for a PIN whenever Arca opens, so someone who picks up your unlocked phone or computer can't look in.

1. Choose **Set up PIN** and pick a code of 4 to 6 digits.
2. Switch on the app lock.

The PIN is also asked when Arca comes back from the background. Once unlocked, it stays open until you close the tab or the app. The app lock is one setting for the whole household.

:::note[Forgot your PIN?]
The lock screen has no reset option. Whoever runs your server can switch the app lock off: see [Reset a forgotten app lock PIN](/Arca/getting-started/updating-and-backups/#reset-a-forgotten-app-lock-pin).
:::

## Privacy mode

Tap the eye on Home's Safe to spend card, or use Settings → **Privacy**, to hide every amount behind dots until you tap it again. Handy when someone is looking over your shoulder. It's remembered on that device.

## People in your household

Everyone who signs in to Arca shares the same household: the same accounts, budgets and goals.

- **Admin**: manages who can sign in and their roles, and can do everything a member can. The first person to set up Arca is the admin.
- **Member**: uses the household day to day (transactions, budgets, goals and settings), but can't manage users.

Admins see everyone in Settings → **Users**, where they can change a role or remove someone.

### Inviting someone

Once the first account exists, nobody can create an account on their own: the sign-in page has no sign-up link, and the setup page only opens with an invite link.

1. Go to Settings → **Users** → **Invite links** and choose **Make an invite link**.
2. **Copy** the link and send it to the person (a message, an email, however you like).
3. They open the link, go through the [first-run setup](/Arca/getting-started/first-run/) and join your household as a **member**.

A link works **once** and stops working after **7 days**. Open links are listed under Invite links; use the bin icon to withdraw one before it is used. Someone who already used a link keeps their account.

:::note[Locked out of your only admin account?]
Whoever runs your server can reopen sign-up temporarily with the `ALLOW_OPEN_SIGNUP` setting: see [Settings you can change](/Arca/getting-started/install/#settings-you-can-change). Create a new account (it becomes an admin), then remove the setting again.
:::
