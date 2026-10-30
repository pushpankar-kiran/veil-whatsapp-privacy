// Veil structure-only DOM probe. Paste into DevTools Console on web.whatsapp.com
// with a chat open. It reports page STRUCTURE only: tag names, ARIA roles, ids, a few
// semantic class names, which attributes exist, text LENGTHS and image URL schemes/hosts.
// It never outputs text, titles, aria-labels, names, numbers or URLs paths.
// The JSON is copied to your clipboard; nothing is sent anywhere.
(() => {
  const SEMANTIC = ["message-in", "message-out", "copyable-text", "selectable-text", "emoji", "overlay"];
  const SAFE_VALUE_ATTRS = ["role", "dir", "data-testid", "data-icon", "contenteditable", "tabindex"];

  function srcKind(el) {
    const s = el.getAttribute("src") || "";
    if (!s) return "";
    if (s.startsWith("blob:")) return "blob";
    if (s.startsWith("data:")) return "data";
    try { return new URL(s, location.href).host; } catch { return "other"; }
  }

  function node(el, depth) {
    const o = { tag: el.tagName.toLowerCase() };
    if (el.id) o.id = el.id;
    for (const a of SAFE_VALUE_ATTRS) if (el.hasAttribute(a)) o[a] = el.getAttribute(a);
    const cls = SEMANTIC.filter((c) => el.classList.contains(c));
    if (cls.length) o.cls = cls;
    const has = Array.from(el.attributes).map((a) => a.name)
      .filter((n) => !SAFE_VALUE_ATTRS.includes(n) && n !== "id" && n !== "class" && n !== "style" && n !== "src");
    if (has.length) o.hasAttr = has; // names only, e.g. "title", "data-pre-plain-text", "aria-label"
    if (el.style && el.style.backgroundImage) o.bgImage = true;
    if (el.tagName === "IMG" || el.tagName === "VIDEO") o.src = srcKind(el);
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (own) o.textLen = own.length;
    if (depth > 0 && el.children.length) {
      o.kids = Array.from(el.children).slice(0, 12).map((c) => node(c, depth - 1));
      if (el.children.length > 12) o.moreKids = el.children.length - 12;
    }
    return o;
  }

  const count = (s) => { try { return document.querySelectorAll(s).length; } catch { return "invalid"; } };
  const SELECTORS = [
    "#app", "#side", "#pane-side", "#main", "#main header", "#main footer",
    '[role="grid"]', '[role="row"]', '[role="listitem"]', '[role="gridcell"]', '[role="application"]', '[role="dialog"]',
    "#pane-side span[title]", "#pane-side span[dir]", "#pane-side img",
    '#pane-side [role="row"]', '#pane-side [role="listitem"]', '#pane-side [role="gridcell"]',
    "#main header span[title]", "#main header span[dir]", "#main header img",
    "#main [data-id]", "#main .message-in", "#main .message-out", "#main [data-pre-plain-text]",
    "#main .copyable-text:not(footer *)", "#main .selectable-text:not(footer *)",
    '[data-testid="msg-container"]', '[data-testid="quoted-message"]', '[data-testid="author"]',
    '[data-testid="link-preview-container"]', '[data-testid="sticker-container"]',
    '#main img[src^="blob:"]', "#main video", '#main [style*="background-image"]',
    'img[src*="pps.whatsapp.net"]', 'footer [contenteditable="true"]',
    "[data-veil]", '[data-veil="names"]', '[data-veil="previews"]', '[data-veil="messages"]',
    '[data-veil="media"]', '[data-veil="avatars"]', '[data-veil="compose"]',
  ];

  const pick = (sel, n) => Array.from(document.querySelectorAll(sel)).slice(0, n);
  const firstListRow = document.querySelector('#pane-side [role="listitem"], #pane-side [role="row"]');
  const msgRows = pick('#main [role="row"]', 40);
  const incoming = msgRows.find((r) => r.querySelector(".message-in")) || msgRows[0];
  const outgoing = msgRows.find((r) => r.querySelector(".message-out"));
  const withMedia = msgRows.find((r) => r.querySelector('img[src^="blob:"], video, [style*="background-image"]'));

  const report = {
    probe: "veil-dom-probe/1",
    title: { hasUnreadPrefix: /^\(\d+\)/.test(document.title) },
    counts: Object.fromEntries(SELECTORS.map((s) => [s, count(s)])),
    topLevel: document.querySelector("#app") ? node(document.querySelector("#app"), 4) : null,
    chatListRow: firstListRow ? node(firstListRow, 10) : null,
    mainHeader: document.querySelector("#main header") ? node(document.querySelector("#main header"), 8) : null,
    incomingMessageRow: incoming ? node(incoming, 12) : null,
    outgoingMessageRow: outgoing ? node(outgoing, 12) : null,
    mediaMessageRow: withMedia && withMedia !== incoming ? node(withMedia, 12) : null,
    footer: document.querySelector("#main footer") ? node(document.querySelector("#main footer"), 8) : null,
  };
  const json = JSON.stringify(report, null, 1);
  if (typeof copy === "function") copy(json);
  console.log("Veil probe: structure-only report copied to clipboard (" + json.length + " chars).");
  return report;
})();
