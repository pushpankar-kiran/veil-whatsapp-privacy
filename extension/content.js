// Veil content script: runs at document_start on web.whatsapp.com.
// It never reads message content into any variable that leaves this function scope,
// and it has no network code at all (tools/audit.py enforces that).
(function () {
  "use strict";

  const html = document.documentElement;
  const CATS = ["names", "previews", "messages", "media", "avatars", "compose"];
  const TEXT_CATS = new Set(["names", "previews", "messages", "compose"]);

  // Static selectors mask content before the tagger has classified it. They use only
  // semantic hooks (ids, ARIA, data-* and URL shapes), never WhatsApp's generated
  // class names, which change with every WhatsApp build.
  const SEL = {
    names: ['[data-veil="names"]', '#main header span[title]', 'span[data-testid="author"]'],
    previews: ['[data-veil="previews"]'],
    messages: [
      '[data-veil="messages"]',
      '#main .copyable-text:not(footer *)',
      '#main .selectable-text:not(footer *)',
      '[data-testid="quoted-message"]',
    ],
    media: [
      '[data-veil="media"]',
      '#main img[src^="blob:"]',
      '#main video',
      '[data-testid="link-preview-container"]',
      '[data-testid="sticker-container"]',
    ],
    avatars: ['[data-veil="avatars"]', 'img[src*="pps.whatsapp.net"]', '#main header img'],
    compose: ['[data-veil="compose"]', 'footer [contenteditable="true"]'],
  };
  // Strict mode: every text leaf and image in the app, regardless of what it is.
  const STRICT_SEL = [
    '#app span[dir]', '#app span[title]', '#app .copyable-text', '#app img',
    '#app video', '#app canvas', '#app [style*="background-image"]', '#app [contenteditable="true"]',
  ];

  // Containers whose hover reveals everything inside them at once.
  const REVEAL_GROUPS = [
    '#pane-side [role="listitem"]', '#pane-side [role="row"]',
    '[role="dialog"] [role="listitem"]', '[role="dialog"] [role="row"]',
    "#main header", '#main [role="row"]',
  ].join(",");

  let settings = VeilSettings.merge({});
  let ready = false;

  // ---------- stylesheet ----------
  const styleEl = document.createElement("style");
  styleEl.id = "veil-mask";

  function ensureStyle() {
    if (!styleEl.isConnected) html.appendChild(styleEl);
  }

  function buildCss(s) {
    const gate = "html[data-veil-on]:not([data-veil-peek])";
    // Hovering anywhere on a contact reveals that whole contact (name, preview, photo)
    // together; likewise a message row (sender + text + media) or the chat header.
    // The typing box is not in any group, so it only reveals when hovered itself.
    // "Show this chat" exempts everything inside the open conversation (#main) while
    // the chat list and everything else stays masked.
    const hov = (s.reveal === "hover" ? `:not(:hover):not(:is(${REVEAL_GROUPS}):hover *)` : "") +
      ":not(html[data-veil-chat-open] #main *)";
    const blurPx = Math.max(2, Math.min(30, Number(s.blurPx) || 8));
    const mediaBlur = s.style === "redact" ? Math.max(24, blurPx * 3) : Math.max(12, blurPx * 2);
    const out = [
      `:root{--veil-blur:${blurPx}px;--veil-media-blur:${mediaBlur}px;--veil-delay:${Math.max(0, s.revealDelayMs | 0)}ms;` +
        `--veil-bar:#3b4a54;--veil-alias-bg:#d9fdd3;--veil-alias-fg:#0b3d2e;--veil-avatar-b:1.75;}`,
      `@media (prefers-color-scheme: dark){:root{--veil-bar:#8696a0;--veil-alias-bg:#005c4b;--veil-alias-fg:#e9fff8;}}`,
      // Masked avatars match WhatsApp's own empty-avatar grey in each theme.
      `:root:has(body.dark){--veil-avatar-b:.85;}`,
    ];
    const list = (sels) => sels.map((x) => `${gate} ${x}${hov}`).join(",\n");
    const all = [];

    for (const cat of CATS) {
      if (!s.categories[cat]) continue;
      const sels = SEL[cat];
      all.push(...sels);
      if (TEXT_CATS.has(cat)) {
        if (s.style === "redact") {
          out.push(`${list(sels)}{color:transparent!important;background-color:var(--veil-bar)!important;` +
            `border-radius:4px!important;text-shadow:none!important;caret-color:var(--veil-bar)!important;}`);
          out.push(`${sels.map((x) => `${gate} ${x}${hov} *`).join(",")}{color:transparent!important;text-shadow:none!important;}`);
          out.push(`${sels.map((x) => `${gate} ${x}${hov} img`).join(",")}{opacity:0!important;}`);
        } else {
          out.push(`${list(sels)}{filter:blur(var(--veil-blur)) grayscale(1)!important;}`);
        }
        // No reveal: kill hover entirely so native title tooltips can't leak names.
        if (s.reveal === "none" && cat !== "compose") out.push(`${list(sels)}{pointer-events:none!important;}`);
      } else if (cat === "avatars") {
        // Every masked profile photo becomes the same flat disc: contrast(0) turns any
        // photo into uniform grey (no colour hints, no dark/light differences), and
        // clip-path stops the halo that blur used to spill outside the circle.
        out.push(`${list(sels)}{filter:grayscale(1) contrast(0) brightness(var(--veil-avatar-b))!important;clip-path:circle(50%)!important;}`);
      } else {
        // clip-path keeps the blur inside the photo's own rounded box.
        out.push(`${list(sels)}{filter:blur(var(--veil-media-blur)) grayscale(1)!important;clip-path:inset(0 round 8px)!important;}`);
      }
    }

    if (s.strict) {
      all.push(...STRICT_SEL);
      out.push(`${list(STRICT_SEL)}{filter:blur(var(--veil-blur)) grayscale(1)!important;}`);
    }

    if (s.aliasNames && s.categories.names) {
      // :not(#veil-a):not(#veil-b) lifts specificity above the id-based static selectors.
      const a = `${gate} [data-veil="names"][data-veil-alias]:not(#veil-a):not(#veil-b)${hov}`;
      out.push(`${a}{font-size:0!important;filter:none!important;color:inherit!important;background:none!important;}`);
      out.push(`${a} > *{display:none!important;}`);
      out.push(`${a}::after{content:attr(data-veil-alias);font-size:var(--veil-fs,15px);color:var(--veil-alias-fg);` +
        `background:var(--veil-alias-bg);padding:0 6px;border-radius:4px;filter:none;}`);
    }

    // Reveal (un-hover) waits for the delay; re-masking is instant.
    if (s.reveal === "hover" && all.length) {
      // Not for "Show this chat": a deliberate click reveals instantly.
      out.push(`${all.map((x) => `html[data-veil-on]:not([data-veil-chat-open]) ${x}`).join(",")}{transition:filter .15s ease var(--veil-delay),color .15s ease var(--veil-delay),background-color .15s ease var(--veil-delay)!important;}`);
      out.push(`${all.map((x) => `${gate} ${x}${hov}`).join(",")}{transition-delay:0s!important;transition-duration:0s!important;}`);
    }
    return out.join("\n");
  }

  // ---------- tagger ----------
  const TIME_RE = /^\d{1,2}[:.]\d{2}(\s?[ap]\.?\s?m\.?)?$/i;
  const ROW_SEL = '[role="row"],[role="listitem"],[role="gridcell"],[role="option"]';

  const aliasKeys = new WeakMap(); // element -> name it was aliased from (virtual lists recycle nodes)

  function setTag(el, cat) {
    if (cat === "names") {
      const name = el.getAttribute("title") || el.textContent || "";
      if (el.getAttribute("data-veil") === cat && aliasKeys.get(el) === name) return;
      const fs = getComputedStyle(el).fontSize;
      if (fs && fs !== "0px") el.style.setProperty("--veil-fs", fs);
      aliasKeys.set(el, name);
      applyAlias(el, name);
    } else if (el.getAttribute("data-veil") === cat) {
      return;
    }
    el.setAttribute("data-veil", cat);
  }

  // Aliases are HMAC-SHA256(name) under a random per-install secret, so nobody can
  // map "Contact 7F3A2C" back to a name by hashing a list of guesses. 24 bits keeps
  // collisions rare across hundreds of contacts. Names never leave this tab.
  let aliasKey = null;
  let aliasKeySecret = "";
  const aliasCache = new Map();
  const PENDING_ALIAS = "Contact ······";

  async function ensureAliasKey(secret) {
    if (secret === aliasKeySecret && aliasKey) return;
    aliasKeySecret = secret;
    aliasCache.clear();
    const raw = new Uint8Array(secret.match(/../g).map((h) => parseInt(h, 16)));
    aliasKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    for (const el of document.querySelectorAll('[data-veil="names"]')) applyAlias(el, aliasKeys.get(el) || "");
  }

  function applyAlias(el, name) {
    const hit = aliasCache.get(name);
    if (hit) return el.setAttribute("data-veil-alias", hit);
    el.setAttribute("data-veil-alias", PENDING_ALIAS);
    if (!aliasKey) return;
    const key = aliasKey;
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(name)).then((sig) => {
      if (key !== aliasKey) return; // secret rotated meanwhile
      const hex = Array.from(new Uint8Array(sig).slice(0, 3), (b) => b.toString(16).padStart(2, "0")).join("");
      const alias = "Contact " + hex.toUpperCase();
      aliasCache.set(name, alias);
      if (aliasKeys.get(el) === name) el.setAttribute("data-veil-alias", alias);
    });
  }

  function isMeta(el) {
    const t = (el.textContent || "").trim();
    return !t || TIME_RE.test(t) || /^\d{1,4}$/.test(t);
  }

  function classifyRow(row) {
    const titled = Array.from(row.querySelectorAll("span[title]")).filter((s) => s.getAttribute("title"));
    if (!titled.length) return;
    const name = titled[0];
    setTag(name, "names");
    for (const s of titled.slice(1)) setTag(s, "previews");
    for (const s of row.querySelectorAll("span[dir]:not([title])")) {
      if (s.contains(name) || name.contains(s) || isMeta(s) || s.closest("[data-veil]")) continue;
      setTag(s, "previews");
    }
    for (const img of row.querySelectorAll("img")) {
      if (!img.closest("span[dir], span[title]")) setTag(img, "avatars");
    }
  }

  function classifyMedia(el, main) {
    if (el.closest("span[dir], span[title], .copyable-text")) return; // inline emoji: container handles it
    const src = el.currentSrc || el.src || "";
    if (/whatsapp\.net/.test(src)) return setTag(el, "avatars");
    if (main) {
      if (el.closest("header")) return setTag(el, "avatars");
      if (el.closest('footer')) return;
      return setTag(el, "media");
    }
    if (el.closest(".overlay")) return setTag(el, "media");
    if (el.closest(ROW_SEL) || el.closest('[role="dialog"]') || el.closest("header")) return setTag(el, "avatars");
  }

  function classifyText(el, main) {
    if (main) {
      if (el.closest("footer")) {
        const ed = el.closest('[contenteditable="true"]');
        if (ed) setTag(ed, "compose");
        return;
      }
      if (el.closest("header")) return el.matches("span[title], span[dir]") && !isMeta(el) && setTag(el, "names");
      const top = el.closest("[data-pre-plain-text]") || el.closest(".copyable-text");
      if (top) return setTag(top, "messages");
      const q = el.closest('[data-testid="quoted-message"], [aria-label="Quoted message" i]');
      if (q) return setTag(q, "messages");
      // Sender name above an incoming group message.
      if (el.matches("span[dir]") && el.closest('[role="row"], [data-id]') && !isMeta(el)) return setTag(el, "names");
      return;
    }
    const row = el.closest(ROW_SEL);
    if (row) return classifyRow(row);
    if (el.matches("span[title]") && el.closest('[role="dialog"], header, section')) setTag(el, "names");
  }

  const CANDIDATES = 'span[title], span[dir], .copyable-text, [contenteditable="true"], img, video, canvas, [style*="background-image"]';

  function classify(el) {
    if (el.nodeType !== 1 || el.id === "veil-curtain") return;
    const main = el.closest("#main");
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || (el.style && el.style.backgroundImage)) {
      classifyMedia(el, main);
    } else if (el.matches('span[title], span[dir], .copyable-text, [contenteditable="true"]')) {
      classifyText(el, main);
    }
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    classify(root);
    for (const el of root.querySelectorAll(CANDIDATES)) classify(el);
    // A change deep inside a list row can shift which span is name vs preview.
    const row = !root.closest("#main") && root.closest(ROW_SEL);
    if (row) classifyRow(row);
  }

  // Tag inside the observer callback itself: it runs as a microtask, before the next
  // paint, so a new message is never drawn untagged. (requestAnimationFrame would
  // stall while the tab is in the background.)
  const observer = new MutationObserver((muts) => {
    const pending = new Set();
    for (const m of muts) {
      if (m.type === "childList") {
        for (const n of m.addedNodes) if (n.nodeType === 1) pending.add(n);
        if (m.target.nodeType === 1 && m.target !== html) pending.add(m.target);
      } else if (m.target.nodeType === 1) {
        pending.add(m.target);
      }
    }
    pending.delete(html);
    selfHeal();
    for (const n of pending) if (n.isConnected) scan(n);
    observer.takeRecords(); // drop the records our own setTag calls just produced
    guardTitle();
    checkChatSwitch();
    queueChatButton();
  });
  observer.observe(html, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["title", "src", "data-veil-on", "data-veil-ready", "data-veil-notify", "data-veil-chat-open"],
  });

  // If anything strips our stylesheet, our <html> flags or the curtain, put them back.
  // Every write is conditional, so this can't loop with the observer.
  function selfHeal() {
    if (!ready) return;
    ensureStyle();
    if (!!settings.enabled !== html.hasAttribute("data-veil-on")) html.toggleAttribute("data-veil-on", !!settings.enabled);
    if (!html.hasAttribute("data-veil-ready")) html.setAttribute("data-veil-ready", "");
    const notifyOff = !(settings.enabled && settings.guardNotifications);
    if (notifyOff !== (html.getAttribute("data-veil-notify") === "off")) {
      if (notifyOff) html.setAttribute("data-veil-notify", "off");
      else html.removeAttribute("data-veil-notify");
    }
    // Only Veil may reveal a chat: a flag set by anything else is removed.
    if (chatOpenKey === null && html.hasAttribute("data-veil-chat-open")) html.removeAttribute("data-veil-chat-open");
    if (settings.locked && !curtainUp()) showCurtain();
  }

  // ---------- title guard ----------
  function guardTitle() {
    if (!settings.enabled || !settings.guardTitle) return;
    const t = document.title;
    const clean = t.replace(/^\(\d+\)\s*/, "");
    if (clean !== t) document.title = clean;
  }

  // ---------- peek (hold Alt) ----------
  let peekUsed = false;
  window.addEventListener("keydown", (e) => {
    if (curtainUp()) return;
    if (settings.reveal === "peek" && e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      html.setAttribute("data-veil-peek", "");
      peekUsed = true;
      e.preventDefault();
    } else if (e.key !== "Alt") {
      html.removeAttribute("data-veil-peek"); // Alt+<key> is a shortcut, not a peek
    }
  }, true);
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt") {
      html.removeAttribute("data-veil-peek");
      if (peekUsed) e.preventDefault(); // keep Chrome from focusing its menu
      peekUsed = false;
    }
  }, true);
  window.addEventListener("blur", () => html.removeAttribute("data-veil-peek"));

  // ---------- privacy curtain ----------
  let curtain = null;
  function curtainUp() {
    return !!(curtain && curtain.isConnected);
  }

  // Locking is persisted (settings.locked), so a reload, a second tab or removing the
  // curtain element brings it straight back. Only a correct PIN (or any key, with no PIN) clears it.
  function lock() {
    settings.locked = true;
    showCurtain();
    VeilSettings.save({ locked: true });
  }

  function showCurtain() {
    if (curtainUp()) return;
    setChatOpen(false);
    curtain = document.createElement("div");
    curtain.id = "veil-curtain";
    const root = curtain.attachShadow({ mode: "closed" });
    const hasPin = !!settings.pinHash;
    root.innerHTML = `
      <style>
        :host{all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;
          backdrop-filter:blur(40px) grayscale(1);-webkit-backdrop-filter:blur(40px) grayscale(1);
          background:rgba(17,27,33,.72);font:15px/1.4 system-ui,"Segoe UI",sans-serif;color:#e9edef}
        .card{text-align:center;padding:32px 40px;border-radius:16px;background:rgba(32,44,51,.9);
          box-shadow:0 10px 40px rgba(0,0,0,.4);min-width:280px}
        svg{width:44px;height:44px;margin-bottom:10px}
        h1{font-size:19px;margin:0 0 6px;font-weight:600}
        p{margin:0 0 16px;color:#aebac1}
        input{all:unset;box-sizing:border-box;width:100%;padding:10px 12px;border-radius:8px;background:#111b21;
          border:1px solid #3b4a54;text-align:center;letter-spacing:.3em;font-size:18px}
        input:focus{border-color:#00a884}
        .err{color:#f15c6d;min-height:1.4em;margin:8px 0 0;font-size:13px}
        button{all:unset;cursor:pointer;margin-top:12px;padding:9px 18px;border-radius:20px;background:#00a884;color:#111b21;font-weight:600}
      </style>
      <div class="card" role="dialog" aria-label="Veil privacy curtain">
        <svg viewBox="0 0 24 24" fill="none" stroke="#00a884" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
        <h1>WhatsApp is veiled</h1>
        ${hasPin
          ? `<p>Enter your Veil PIN to continue</p><input type="password" inputmode="numeric" autocomplete="off" aria-label="PIN"><div class="err"></div>`
          : `<p>Click or press any key to unveil</p><button type="button">Unveil</button>`}
      </div>`;
    const input = root.querySelector("input");
    const err = root.querySelector(".err");
    let busy = false;
    const tryUnlock = async () => {
      if (!hasPin) return unlock();
      if (busy) return;
      busy = true;
      const r = await VeilSettings.verifyPin(input.value);
      busy = false;
      input.value = "";
      if (r.ok) return unlock();
      err.textContent = r.waitSec ? `Too many wrong PINs. Try again in ${r.waitSec}s.`
        : `Wrong PIN. ${r.left} ${r.left === 1 ? "try" : "tries"} before a wait.`;
    };
    if (input) {
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
      setTimeout(() => input.focus(), 0);
    } else {
      curtain.addEventListener("click", tryUnlock);
    }
    curtain._tryUnlock = tryUnlock;
    curtain._hasPin = hasPin;
    html.appendChild(curtain);
  }

  function hideCurtain() {
    const c = curtain;
    curtain = null;
    if (c) c.remove();
    lastActivity = Date.now();
  }

  function unlock() {
    settings.locked = false; // clear first, so selfHeal doesn't re-raise the curtain
    hideCurtain();
    VeilSettings.save({ locked: false });
  }

  // While the curtain is up, swallow keyboard input so nothing reaches WhatsApp's compose box.
  const swallow = (e) => {
    if (!curtainUp()) return;
    if (e.composedPath().includes(curtain)) return; // events inside our own shadow input
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.type === "keydown" && !curtain._hasPin) curtain._tryUnlock();
  };
  for (const t of ["keydown", "keypress", "keyup", "paste"]) window.addEventListener(t, swallow, true);

  let lastActivity = Date.now();
  for (const t of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(t, () => { if (!curtainUp()) lastActivity = Date.now(); }, { capture: true, passive: true });
  }
  setInterval(() => {
    const min = Number(settings.idleLockMin) || 0;
    if (settings.enabled && min > 0 && !curtainUp() && Date.now() - lastActivity > min * 60000) lock();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && settings.enabled && settings.lockOnHide && !curtainUp()) lock();
  });

  // ---------- "Show this chat" ----------
  // Reveals only the open conversation. It re-masks by itself when you switch chats,
  // the curtain comes down, or the tab is hidden. The chat key stays in memory only.
  let chatOpenKey = null;
  let chatOpenMain = null;
  let chatBtnHost = null;
  let chatBtn = null;
  let chatBtnLabel = null;

  // Identifies the open chat by its NAME: the top-most text line in the header.
  // The line below it ("click here for contact info" -> "online" -> "typing...")
  // keeps changing, so keying on it re-masked the chat while you were reading.
  function currentChatKey() {
    const main = document.querySelector("#main");
    if (!main) return null;
    const header = main.querySelector("header");
    if (!header) return "#main";
    let best = null;
    let bestTop = Infinity;
    for (const el of header.querySelectorAll("span[title], span[dir]")) {
      const text = el.getAttribute("title") || el.textContent.trim();
      if (!text) continue;
      const top = el.getBoundingClientRect().top;
      if (top < bestTop - 1) { best = text; bestTop = top; } // first wins on the same line
    }
    return best || "#main";
  }

  function setChatOpen(on) {
    if (on && currentChatKey() !== null) {
      chatOpenKey = currentChatKey();
      chatOpenMain = document.querySelector("#main");
      html.setAttribute("data-veil-chat-open", "");
    } else {
      chatOpenKey = null;
      chatOpenMain = null;
      html.removeAttribute("data-veil-chat-open");
    }
    updateChatButton();
  }

  function checkChatSwitch() {
    if (chatOpenKey === null) return;
    if (document.querySelector("#main") !== chatOpenMain || currentChatKey() !== chatOpenKey) setChatOpen(false);
  }

  function ensureChatButton() {
    if (chatBtnHost && chatBtnHost.isConnected) return;
    chatBtnHost = document.createElement("div");
    chatBtnHost.id = "veil-chat-btn";
    const root = chatBtnHost.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        :host{all:initial;position:fixed;z-index:2147483646;transform:translateX(-50%);display:none}
        button{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 14px 6px 10px;border-radius:18px;
          font:600 13px/1 system-ui,"Segoe UI",sans-serif;background:rgba(17,27,33,.82);color:#e9edef;
          box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:.85;transition:opacity .15s}
        button:hover{opacity:1}
        button[aria-pressed="true"]{background:#00a884;color:#111b21;opacity:1}
        button:focus-visible{outline:2px solid #00a884;outline-offset:2px}
        svg{width:16px;height:16px}
      </style>
      <button type="button" aria-pressed="false" title="Veil: reveal only this conversation (Alt+Shift+U)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
        <span>Show this chat</span>
      </button>`;
    chatBtn = root.querySelector("button");
    chatBtnLabel = root.querySelector("span");
    chatBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setChatOpen(chatOpenKey === null);
    });
    html.appendChild(chatBtnHost);
  }

  function updateChatButton() {
    const main = document.querySelector("#main");
    const show = ready && settings.enabled && settings.chatRevealButton && settings.reveal !== "none" && main && !curtainUp();
    if (!show) {
      if (chatBtnHost) chatBtnHost.style.display = "none";
      return;
    }
    ensureChatButton();
    const r = main.getBoundingClientRect();
    const hdr = main.querySelector("header");
    const top = hdr ? hdr.getBoundingClientRect().bottom : r.top;
    chatBtnHost.style.left = Math.round(r.left + r.width / 2) + "px";
    chatBtnHost.style.top = Math.round(top + 10) + "px";
    chatBtnHost.style.display = "block";
    const open = chatOpenKey !== null;
    chatBtn.setAttribute("aria-pressed", String(open));
    chatBtnLabel.textContent = open ? "Hide this chat" : "Show this chat";
  }

  let btnQueued = false;
  function queueChatButton() {
    if (btnQueued) return;
    btnQueued = true;
    requestAnimationFrame(() => { btnQueued = false; updateChatButton(); });
  }
  window.addEventListener("resize", queueChatButton);
  document.addEventListener("visibilitychange", () => { if (document.hidden) setChatOpen(false); });

  // ---------- apply settings ----------
  let lastRevealToggle = null;
  function apply(s) {
    settings = s;
    styleEl.textContent = buildCss(s);
    // notify-guard.js (MAIN world) reads data-veil-notify; absence means "guard on" (fail closed).
    ready = true;
    selfHeal();
    if (!s.locked && curtainUp()) hideCurtain(); // unlocked in another tab
    if (lastRevealToggle !== null && s.revealChatToggle !== lastRevealToggle) setChatOpen(chatOpenKey === null);
    lastRevealToggle = s.revealChatToggle;
    if (!s.enabled) setChatOpen(false);
    updateChatButton();
    if (s.aliasNames) {
      if (!s.aliasSecret) VeilSettings.save({ aliasSecret: VeilSettings.randomHex(32) });
      else ensureAliasKey(s.aliasSecret);
    }
    guardTitle();
  }

  VeilSettings.load().then((s) => {
    apply(s);
    if (document.body) scan(document.body);
    else document.addEventListener("DOMContentLoaded", () => scan(document.body), { once: true });
  });
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === "local") VeilSettings.load().then(apply);
  });

  // ---------- coverage report for the popup (counts only, never content) ----------
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!sender || sender.id !== chrome.runtime.id) return; // only Veil's own popup
    if (!msg || msg.type !== "veil:stats") return;
    const counts = {};
    for (const cat of CATS) {
      counts[cat] = document.querySelectorAll(SEL[cat].join(",")).length;
    }
    reply({
      counts,
      chatOpen: !!document.querySelector("#main"),
      listOpen: !!document.querySelector("#pane-side"),
      locked: curtainUp(),
      chatShown: chatOpenKey !== null,
    });
  });
})();
