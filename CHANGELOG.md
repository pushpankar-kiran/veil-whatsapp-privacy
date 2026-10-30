# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-10-30

### Fixed
- **"Show this chat" no longer re-masks while you scroll or read.** The open chat was
  identified by the first titled text in the header, which on WhatsApp is often the
  subtitle ("click here for contact info", then "online" or "typing..."). It is now
  identified by the chat's name, the top line of the header.
- **Masked profile photos look the same.** Each one is now a flat grey disc matching
  WhatsApp's empty avatar, clipped to its circle, instead of a blur whose dark or light
  halo spilled outside the photo. Media blur is also clipped to the photo's box.

## [1.0.0] - 2026-10-30

### Added
- Masks **contact names, chat previews, messages, quoted replies, photos and media,
  profile photos and the typing box** on WhatsApp Web, with a toggle for each.
- Three mask styles: **Blur** (adjustable), **Redact** (solid bars) and **Aliases**
  (names become stable pseudonyms like "Contact 7F3A2C").
- Reveal modes: **hover** (hovering a contact reveals that whole contact or message
  row), **hold Alt to peek**, or **never**.
- **Show this chat** (on-page button, `Alt+Shift+U`, or popup): reveals only the open
  conversation and re-masks it when you switch chats, lock, or leave the tab.
- **Leak guards:** desktop notifications rewritten to "New message", and the unread
  count stripped from the tab title.
- **Privacy curtain:** panic lock (`Alt+Shift+L`), auto-lock on idle or tab switch,
  and an optional PIN.
- **Presenter** and **Everyday** presets (`Alt+Shift+P`).
- **Coverage meter** in the popup, and **Strict mode**, which masks every text and
  image whatever WhatsApp's layout.
- Fail-closed boot: WhatsApp stays blurred until the mask is ready.
- `tools/audit.py` (zero-network audit), `tools/run_checks.py` (56 headless
  behaviour + security checks), `tools/dom-probe.js` (structure-only layout report).

### Security
- Zero network access: `storage` permission only, no host permissions, extension-page
  CSP with `connect-src 'none'`, settings in `chrome.storage.local` only.
- The lock state persists across reloads and tabs. The PIN is a PBKDF2-SHA256 hash
  (310k iterations) with a growing wait after 5 wrong tries. With a PIN set, the
  popup is locked and the shortcut can't turn masking off.
- Aliases are HMAC-SHA256 under a random per-install secret, so they can't be
  reversed by hashing guessed names.
- Veil restores its stylesheet, flags and lock screen if anything removes them, and
  accepts messages only from its own popup. Stored settings are validated on load.
  See [SECURITY.md](SECURITY.md).

[1.0.1]: https://github.com/pushpankar-kiran/veil-whatsapp-privacy/releases/tag/v1.0.1
[1.0.0]: https://github.com/pushpankar-kiran/veil-whatsapp-privacy/releases/tag/v1.0.0
