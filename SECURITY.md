# Security Policy

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public issue.

Use GitHub's [private vulnerability reporting](https://github.com/pushpankar-kiran/veil-whatsapp-privacy/security/advisories/new)
("Report a vulnerability" under the repository's **Security** tab). You'll get a
response as soon as possible.

## Supported versions

Only the latest release receives fixes. Please upgrade before reporting.

## Security review

The review below (2026-10-30) covered every file in `extension/`. All findings are fixed and each fix has a
regression check in `test/checks.js`, run headlessly by `tools/run_checks.py` in CI, plus `tools/audit.py`.

### What Veil protects against

| Threat | Covered? |
|---|---|
| People looking at your screen: shoulder-surfers, open offices, screen-shares, recordings | Yes. This is the main job |
| Your WhatsApp data reaching any third party through the extension | Yes. The extension has no network access at all |
| Someone at your unlocked computer for a minute (curtain, PIN, shortcuts) | Yes, against casual access |
| Someone with your unlocked computer, time, and Chrome knowledge | **No.** They can disable the extension at `chrome://extensions`. Lock your PC (Win+L) |
| Malware on your PC, or WhatsApp itself | **No.** Those already have the data. No extension can protect against them |

### Findings and fixes

| # | Severity | Finding | Fix | Check |
|---|---|---|---|---|
| 1 | **High** | **Reloading the tab (F5) skipped the lock curtain.** The lock state lived only in page memory | Lock state is saved (`locked`). Reloads and new tabs come up locked, and unlocking in one tab unlocks all | Verified by reloading while locked |
| 2 | **High** | **The popup could turn masking off or clear the PIN without the PIN.** So could `Alt+Shift+X` | With a PIN set, the popup is locked (`inert`) until the PIN is entered. The shortcut can only turn masking on | Popup gate test: locked, wrong PIN refused, right PIN unlocks |
| 3 | **Medium** | **Aliases could be reversed.** "Contact 7F3A" was a public FNV hash of the name, so anyone with a list of likely names (e.g. watching a recording) could hash guesses and match them | Aliases are HMAC-SHA256 under a random 256-bit per-install secret, 24 bits shown (fewer collisions) | "alias depends on a secret key" |
| 4 | **Medium** | **The PIN was guessable offline and online.** It used one round of SHA-256, and wrong guesses were unlimited | PBKDF2-SHA256 with 310,000 iterations and a random 128-bit salt. Constant-time compare. After 5 wrong tries, a wait of 30 s that doubles up to 15 min, kept in storage so reloads don't reset it | "5 wrong PINs trigger a wait", "right PIN refused during the wait" |
| 5 | **Medium** | **Masking could be stripped.** Removing Veil's stylesheet, its `<html>` flags or the curtain (DevTools, a page script) unmasked everything until reload | A self-heal routine restores all of them within the same frame | "removed curtain re-appears", "stylesheet + on-flag restored", "page can't switch the notification guard off" |
| 6 | Low | **The content script answered messages without checking the sender** | Replies only when `sender.id === chrome.runtime.id` | "messages from other senders are ignored" |
| 7 | Low | **Stored settings were used unchecked.** A corrupted value could inject CSS | Every setting is type-checked, clamped or allow-listed on load | "stored values are type-checked and clamped" |
| 8 | Low | **Recycled chat-list rows could keep the previous contact's alias,** which could mislead you into messaging the wrong person | Aliases are recomputed whenever the name under a row changes | Covered by the alias checks |

### Already secure by design (verified)

- **No network.** Permissions are `storage` only, with no `host_permissions` and no `web_accessible_resources`.
  The CSP is `connect-src 'none'`, with no remote code, `eval` or `innerHTML` of page data.
  `tools/audit.py` blocks all of these and was shown to catch a planted `fetch()`.
- **No data leaves the tab.** Names and messages are only ever read in memory, to hash aliases. The popup
  receives element **counts** only.
- **Settings are local.** They use `chrome.storage.local`, never sync.
- **The curtain** lives in a closed Shadow DOM, and keystrokes are blocked from reaching WhatsApp's
  compose box while it is up.
- **Fail-closed boot.** If Veil fails to start, WhatsApp stays blurred.
- **"Show this chat" can only be switched on by Veil.** A reveal flag set by anything else is removed at once, and the reveal ends when you switch chats, lock, or leave the tab.
- **No dependencies.** There are no npm packages and no third-party code. The extension is loaded
  unpacked, so there is no auto-update channel anyone could hijack.

### Known limits (honest list)

1. **Notifications sent by WhatsApp's service worker** (e.g. push notifications while the tab is closed)
   bypass the notification guard, because extensions cannot inject into service workers. For full
   protection, also turn off message previews in Windows notification settings or in WhatsApp.
2. **WhatsApp can tell Veil is installed** from its `data-veil` attributes. Nothing is sent, but the
   page can see them.
3. **Hover reveal shows content to anyone watching** while you hover. Use **Presenter** (no reveal)
   when screen-sharing.
4. **A 4-digit PIN is still a 4-digit PIN.** The back-off limits guessing at the curtain. Use 6+ digits
   if you share the computer.
5. **Chrome does not encrypt `storage.local` at rest.** It holds settings and the PIN hash, never
   WhatsApp data.
6. **Selectors on live WhatsApp are not yet verified**, so a layout change could expose an element.
   If the coverage meter shows 0 for a category, turn on Strict mode.
