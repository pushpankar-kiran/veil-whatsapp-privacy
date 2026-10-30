# Privacy Policy: Veil

_Last updated: 2026-10-30_

Veil masks contact names, messages, media and notifications on WhatsApp Web. It is
built so that none of your data ever leaves your browser.

## What the extension accesses
- **The WhatsApp Web page** (`https://web.whatsapp.com/*`) only, so it can mask what
  is shown there. It runs on no other site.
- To build name aliases ("Contact 7F3A2C"), it reads contact names **in memory**,
  inside that tab, and hashes them with a secret that never leaves your device.

## Where that data goes
- **Nowhere.** The extension has no network access. It requests no host permissions,
  and its Content Security Policy blocks all connections (`connect-src 'none'`).
- **No data is sent to the extension's authors or to any third party.**
- The extension contains **no analytics, tracking, or advertising**.

## What is stored, and where
- Your **settings**, a salted **PBKDF2 hash of your PIN** (if you set one), and the
  random alias secret are stored in `chrome.storage.local` on your device. They are
  never synced or transmitted.
- **No names, messages, phone numbers or media are ever stored.**

## Your control
- Change or clear any setting, including the PIN, from the toolbar popup.
- Removing the extension at `chrome://extensions` deletes everything it stored.

## Contact
Questions: open an issue at
https://github.com/pushpankar-kiran/veil-whatsapp-privacy/issues
