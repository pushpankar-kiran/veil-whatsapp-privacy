# Market analysis: privacy masking for WhatsApp Web

Snapshot taken 2026-10-30 from Chrome Web Store trackers (ExtScope, ChromeBoard, ExtensionAuditor), the
competitors' public GitHub repos, and their published privacy policies.

## Who is out there

| Product | Users | Rating | Model | How it masks | Network / data |
|---|---|---|---|---|---|
| Privacy Extension For WhatsApp Web (LukasLen → now maintained by muzakki.id) | ~1M | **2.7** (1.2K reviews) | Free, MIT | CSS blur, hover to reveal, Alt+X toggle | README: "We only communicate with our server to display information about problems or updates" |
| Privacy for WhatsApp Web (Auto Blur WA), the same maintainer's "modern" fork | small | n/a | Free, MIT | Same CSS plus idle blur and per-element blur radius | Same family as above |
| Privacy Extension For WhatsApp Web (wabulk.net) | ~200K | 4.7 | Funnel into a bulk-messaging/CRM product | Blur | Vendor sells WhatsApp marketing tools |
| WA Web Plus (Elbruz) / WAPlus | 100K+ | ~3.0 | Freemium suite (CRM, scheduler, deleted-msg recovery) | Blur is one feature among dozens | Privacy policy declares `identity` + host permissions for "backend communication" and says it **may process messages, contacts, media** |
| Blur for WhatsApp Web (listing is now "Wa Ai Crm") | ~2K | n/a | CRM funnel | CSS blur on 4 categories | Claims CSS-only, but the listing was renamed into an AI CRM |
| WhatsApp Blur, Privacy Extension for WhatsApp Privacy, SheetWA, … | 1–10K each | 2.0–5.0 (few reviews) | Mostly lead magnets | Blur | Unverified |

## What is wrong with them, from their own code and reviews

1. **They break whenever WhatsApp ships an update.** The market leader's CSS targets WhatsApp's generated
   atomic class names (e.g. `div.xjbqb8w.x1iyjqo2.x1f6kntn…`) and keeps two eras of selectors stacked
   ("former wa version v2.2412", "updated wa version v2.3000"). Every WhatsApp build reshuffles those
   classes, so the blur silently stops working. That fits the 2.7 rating on 1M users.
2. **They fail open.** When a selector misses, the content shows in clear text and nothing tells the user.
   Content also flashes unmasked while the page loads.
3. **Blur is the only kind of mask.** Light blur on large text is often still readable on a projector or
   in a recording, and nobody offers a solid redaction bar or name aliases.
4. **Several leaks are ignored:** desktop notification popups (sender and message text), the unread count
   in the tab title, the compose box (only "lighter colour"), quoted replies, link previews, and dialogs
   such as Forward-to lists and search results.
5. **Privacy is a claim, not something enforced.** Products phone home for "updates", use
   `chrome.storage.sync` (settings go to Google), or are funnels for CRM/bulk-message vendors whose
   policies allow processing message content.
6. **Hover-to-reveal is the only reveal mode.** That is unsafe while screen-sharing, because any
   accidental hover exposes a message to the whole call.
7. **Lock features are weak or missing.** At best they blur on idle, with no curtain, PIN, panic key, or
   lock when you switch tabs.

## Veil's answer (feature spec)

| # | Gap | Veil |
|---|---|---|
| 1 | Breaks on updates | **Semantic selectors** (ARIA roles, `#pane-side`, `#main`, `header`/`footer`, `span[title]`, `data-id`, `data-pre-plain-text`, `contenteditable`, avatar CDN host, `blob:` media) plus a **runtime tagger** (MutationObserver) that classifies elements by structure rather than class names |
| 2 | Fails open | **Fail-closed boot shield**: a manifest CSS file blurs the whole app at `document_start` until settings load, so nothing flashes. **Strict mode** blurs all text and images inside the app, so coverage no longer depends on any selector. **Coverage meter** in the popup warns when a category finds 0 elements while a chat is open |
| 3 | Blur only | Three mask styles: **Blur** (adjustable), **Redact** (solid bars that are safe on projectors and in recordings), **Alias** (names become stable pseudonyms like "Contact 7F3A", so you can still tell chats apart while sharing your screen) |
| 4 | Leaks ignored | Masks names, previews, messages, quoted replies, link previews, media, avatars, compose box, dialogs and search results. **Notification guard** rewrites desktop notifications to "New message", with no sender, text or photo. **Tab title guard** strips the unread count |
| 5 | Privacy is a claim | **Zero-network by construction**: the only permission is `storage`, there are no host permissions, `connect-src 'none'` CSP on extension pages, no remote code, and `storage.local` only (never sync). `tools/audit.py` fails the build if any network API or external URL appears in the code |
| 6 | Hover unsafe | Reveal modes: **hover** (with delay), **hold Alt to peek**, or **none** (Presenter mode) |
| 7 | Weak lock | **Privacy curtain**: panic hotkey (Alt+Shift+L), auto-lock on idle, auto-lock on tab switch, optional local PIN (PBKDF2, 310k iterations, with wrong-PIN back-off) |
| + | | One-click **Presenter preset**, rebindable shortcuts, light and dark popup, free, MIT, no account |

Sources: chromewebstore listings via extscope.org/extension/jbojhlhhggfmmkpefknmbdhlaghehini,
chromeboard.com (Blur for WhatsApp Web / Wa Ai Crm), extensionauditor.com (WA Web Plus),
github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web, github.com/aryomuzakki/privacy-whatsapp-web-auto-blur
(src/css/*.css), tostracker.app (WA Web Plus privacy policy).
