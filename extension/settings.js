// Shared settings schema. Loaded by the content script, the popup and the background worker.
// Storage is chrome.storage.local ONLY. The synced storage area would upload settings to Google.
(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,
    style: "blur",          // "blur" | "redact"
    aliasNames: false,      // names become keyed pseudonyms ("Contact 7F3A2C")
    aliasSecret: "",        // random per-install HMAC key, generated on first use
    reveal: "hover",        // "hover" | "peek" (hold Alt) | "none"
    revealDelayMs: 250,
    blurPx: 8,
    strict: false,          // blur ALL text/images in the app: selector-independent coverage
    chatRevealButton: true, // floating "Show this chat" button over the open conversation
    revealChatToggle: 0,    // bumped by the popup / shortcut to toggle "Show this chat"
    categories: Object.freeze({
      names: true,
      previews: true,
      messages: true,
      media: true,
      avatars: true,
      compose: true,
    }),
    guardTitle: true,         // strip "(3)" unread count from the tab title
    guardNotifications: true, // rewrite desktop notifications to a generic text
    lockOnHide: false,        // curtain when the tab is hidden
    idleLockMin: 0,           // 0 = off
    locked: false,            // persisted, so reloading the tab cannot skip the curtain
    pinHash: "",              // PBKDF2-SHA256 hex, "" = no PIN
    pinSalt: "",
    pinFails: 0,
    pinLockUntil: 0,          // epoch ms; wrong-PIN back-off
  });

  const PRESETS = Object.freeze({
    presenter: {
      enabled: true, style: "redact", aliasNames: true, reveal: "none", strict: false,
      guardTitle: true, guardNotifications: true,
      categories: { names: true, previews: true, messages: true, media: true, avatars: true, compose: true },
    },
    everyday: {
      enabled: true, style: "blur", aliasNames: false, reveal: "hover", strict: false,
      categories: { names: true, previews: true, messages: true, media: true, avatars: true, compose: false },
    },
  });

  const ONE_OF = { style: ["blur", "redact"], reveal: ["hover", "peek", "none"] };
  const clampNum = (v, lo, hi, dflt) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : dflt);
  const HEX = /^[0-9a-f]*$/;

  // Never trust stored values blindly: every field is type-checked and clamped,
  // so a malformed value can't inject CSS or break masking.
  function merge(stored) {
    const src = stored || {};
    const s = {};
    for (const [k, d] of Object.entries(DEFAULTS)) {
      if (k === "categories") continue;
      const v = src[k];
      if (typeof d === "boolean") s[k] = typeof v === "boolean" ? v : d;
      else if (typeof d === "number") s[k] = d;
      else s[k] = typeof v === "string" ? v : d;
    }
    for (const [k, opts] of Object.entries(ONE_OF)) if (!opts.includes(s[k])) s[k] = DEFAULTS[k];
    s.blurPx = clampNum(src.blurPx, 2, 30, DEFAULTS.blurPx);
    s.revealDelayMs = clampNum(src.revealDelayMs, 0, 5000, DEFAULTS.revealDelayMs);
    s.idleLockMin = clampNum(src.idleLockMin, 0, 240, 0);
    s.pinFails = clampNum(src.pinFails, 0, 1e6, 0);
    s.pinLockUntil = clampNum(src.pinLockUntil, 0, 1e15, 0);
    s.revealChatToggle = clampNum(src.revealChatToggle, 0, 1e15, 0);
    for (const k of ["pinHash", "pinSalt", "aliasSecret"]) if (!HEX.test(s[k])) s[k] = "";
    s.categories = {};
    const cats = src.categories || {};
    for (const k of Object.keys(DEFAULTS.categories)) {
      s.categories[k] = typeof cats[k] === "boolean" ? cats[k] : DEFAULTS.categories[k];
    }
    return s;
  }

  function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (stored) => resolve(merge(stored)));
    });
  }

  function save(patch) {
    return new Promise((resolve) => chrome.storage.local.set(patch, resolve));
  }

  // ---------- crypto helpers ----------
  const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
  const PBKDF2_ITERATIONS = 310000;

  async function hashPin(pin, saltHex) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
    return toHex(bits);
  }

  function sameHex(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function setPin(pin) {
    const salt = randomHex(16);
    await save({ pinSalt: salt, pinHash: await hashPin(pin, salt), pinFails: 0, pinLockUntil: 0 });
  }

  // Verifies a PIN with persistent back-off: after 5 wrong tries, wait 30 s, doubling
  // up to 15 min. Counters live in storage, so reloading doesn't reset them.
  async function verifyPin(pin) {
    const s = await load();
    if (!s.pinHash) return { ok: true };
    const now = Date.now();
    if (now < s.pinLockUntil) return { ok: false, waitSec: Math.ceil((s.pinLockUntil - now) / 1000) };
    const ok = sameHex(await hashPin(String(pin), s.pinSalt), s.pinHash);
    if (ok) {
      if (s.pinFails || s.pinLockUntil) await save({ pinFails: 0, pinLockUntil: 0 });
      return { ok: true };
    }
    const fails = s.pinFails + 1;
    const lockUntil = fails >= 5 ? now + Math.min(15 * 60000, 30000 * 2 ** (fails - 5)) : 0;
    await save({ pinFails: fails, pinLockUntil: lockUntil });
    return { ok: false, waitSec: lockUntil ? Math.ceil((lockUntil - now) / 1000) : 0, left: Math.max(0, 5 - fails) };
  }

  root.VeilSettings = { DEFAULTS, PRESETS, merge, load, save, randomHex, hashPin, setPin, verifyPin };
})(typeof self !== "undefined" ? self : this);
