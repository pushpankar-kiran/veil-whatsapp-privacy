// In-page regression checks for Veil on the mock page. Run: await veilChecks()
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => sleep(20); // not rAF: it pauses while the tab is hidden
  const set = (patch) => new Promise((r) => chrome.storage.local.set(patch, r)).then(() => sleep(30)).then(frame);
  const cs = (el, pseudo) => getComputedStyle(el, pseudo || null);
  const blurred = (el) => /blur\(/.test(cs(el).filter);
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));

  window.veilChecks = async function () {
    const results = [];
    const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail || "" });
    const D = VeilSettings.DEFAULTS;
    await set(Object.assign({}, D, { categories: Object.assign({}, D.categories) }));
    await frame();

    const name = q('#chatlist span[title="Priya Sharma"]');
    const prev = q('#chatlist span[title="Waah"]');
    const time = qa("#chatlist .t")[0];
    const badge = q("#chatlist .badge");
    const msg = q("#msgs .message-in .copyable-text");
    const author = q("#msgs .author");
    const msgTime = q("#msgs .msgtime");
    const quoted = q('[data-testid="quoted-message"]');
    const photo = q("#photo");
    const avatar = q("#chatlist img");
    const hdrName = q('#main header span[title="Meadow Grocers"]');
    const compose = q("#compose");

    ok("boot shield lifted after settings load", document.documentElement.hasAttribute("data-veil-ready"));
    ok("chat name tagged + blurred", name.dataset.veil === "names" && blurred(name), name.dataset.veil);
    ok("chat preview tagged + blurred", prev.dataset.veil === "previews" && blurred(prev), prev.dataset.veil);
    ok("chat-list time stays readable", !time.hasAttribute("data-veil") && !blurred(time));
    ok("unread badge stays readable", !blurred(badge));
    ok("message text blurred", blurred(msg));
    ok("group sender name blurred", author.dataset.veil === "names" && blurred(author));
    ok("message time stays readable", !blurred(msgTime), msgTime.dataset.veil || "");
    ok("quoted reply blurred", blurred(quoted));
    ok("photo (blob:) blurred", blurred(photo), photo.dataset.veil);
    ok("avatar blurred", avatar.dataset.veil === "avatars" && blurred(avatar));
    ok("header name blurred", blurred(hdrName));
    ok("compose box blurred", blurred(compose), compose.dataset.veil);
    ok("tab title unread count removed", document.title === "WhatsApp", document.title);

    new Notification("Priya Sharma", { body: "secret text", icon: "x.png" });
    const n = window.__notifications.at(-1);
    ok("notification scrubbed", n.title === "WhatsApp" && n.opts.body === "New message" && !n.opts.icon, JSON.stringify(n));

    // Dynamically added chat (virtualised list / new conversation).
    const li = addChat(["Zoya Khan", "see you at 8", "7:02 pm", "#db2777", ""]);
    await sleep(30); await frame();
    ok("new chat row masked on arrival", blurred(li.querySelector("span[title]")) && blurred(li.querySelector('span[title="see you at 8"]')));

    // Redact style.
    await set({ style: "redact" });
    ok("redact: text transparent with bar", cs(msg).color === "rgba(0, 0, 0, 0)" && cs(msg).backgroundColor !== "rgba(0, 0, 0, 0)",
      cs(msg).color + " / " + cs(msg).backgroundColor);
    ok("redact: media still hidden", blurred(photo));

    // Alias names.
    await set({ aliasNames: true });
    await sleep(80); // first use generates the secret, then HMACs resolve asynchronously
    const after = cs(name, "::after").content;
    ok("alias: pseudonym shown instead of name", /^"Contact [0-9A-F]{6}"$/.test(after) && cs(name).fontSize === "0px", after);
    const listAlias = q('#chatlist span[title="Meadow Grocers"]').dataset.veilAlias;
    ok("alias: same contact gets same alias in list and header, others differ",
      listAlias === hdrName.dataset.veilAlias && listAlias !== name.dataset.veilAlias, listAlias);

    // Reveal: never → no hover, no tooltips.
    await set({ reveal: "none" });
    ok("reveal none: pointer-events off on names", cs(prev).pointerEvents === "none");
    ok("reveal none: compose still clickable", cs(compose).pointerEvents !== "none");

    // Peek (hold Alt).
    await set({ style: "blur", aliasNames: false, reveal: "peek" });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));
    await frame();
    ok("peek: holding Alt reveals", !blurred(msg));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
    await frame();
    ok("peek: releasing Alt re-masks", blurred(msg));

    // Category off.
    await set({ reveal: "hover", categories: Object.assign({}, D.categories, { messages: false }) });
    ok("category off: messages visible, names still masked", !blurred(msg) && blurred(name));

    // Strict mode covers even when all categories are off.
    const none = { names: false, previews: false, messages: false, media: false, avatars: false, compose: false };
    await set({ categories: none, strict: true });
    ok("strict: masks without any category", blurred(name) && blurred(msg) && blurred(photo));

    // Master switch.
    await set({ strict: false, categories: D.categories, enabled: false });
    ok("disabled: nothing masked", !blurred(name) && !blurred(msg));
    await set({ enabled: true });

    // Curtain via panic lock; keys are swallowed, then unlock.
    let typed = 0;
    const onKey = () => typed++;
    compose.addEventListener("keydown", onKey);
    await set({ locked: true });
    const cur = q("#veil-curtain");
    ok("panic lock shows curtain", !!cur && cs(cur).position === "fixed");

    // SECURITY: removing the curtain (DevTools / page script) brings it straight back.
    cur.remove();
    await sleep(10);
    ok("security: removed curtain re-appears", !!q("#veil-curtain"));

    q("#veil-curtain"); // the re-created one
    compose.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, composed: true }));
    ok("curtain swallows typing", typed === 0, "typed=" + typed);
    await sleep(30);
    ok("any key unlocks without PIN, and unlock is persisted", !q("#veil-curtain") &&
      (await new Promise((r) => chrome.storage.local.get(null, r))).locked === false);
    compose.removeEventListener("keydown", onKey);

    // SECURITY: stripping our stylesheet or <html> flags self-heals.
    q("#veil-mask").remove();
    document.documentElement.removeAttribute("data-veil-on");
    await sleep(10);
    ok("security: stylesheet + on-flag restored after removal", !!q("#veil-mask") && document.documentElement.hasAttribute("data-veil-on") && blurred(msg));
    document.documentElement.setAttribute("data-veil-notify", "off");
    await sleep(10);
    ok("security: page can't switch the notification guard off", document.documentElement.getAttribute("data-veil-notify") !== "off");

    // SECURITY: PIN uses PBKDF2 and has persistent back-off.
    await VeilSettings.setPin("1234");
    const st = await new Promise((r) => chrome.storage.local.get(null, r));
    ok("security: PIN stored as PBKDF2 hash with random salt, never in clear", /^[0-9a-f]{64}$/.test(st.pinHash) &&
      /^[0-9a-f]{32}$/.test(st.pinSalt) && !JSON.stringify(st).includes('"1234"') &&
      st.pinHash === (await VeilSettings.hashPin("1234", st.pinSalt)));
    await set({ locked: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    await sleep(20);
    ok("PIN curtain ignores random keys", !!q("#veil-curtain"));
    let last;
    for (let i = 0; i < 5; i++) last = await VeilSettings.verifyPin("0000");
    ok("security: 5 wrong PINs trigger a wait", !last.ok && last.waitSec >= 25, JSON.stringify(last));
    const blockedRight = await VeilSettings.verifyPin("1234");
    ok("security: even the right PIN is refused during the wait", !blockedRight.ok && blockedRight.waitSec > 0);
    await set({ pinFails: 0, pinLockUntil: 0 });
    ok("right PIN accepted after the wait", (await VeilSettings.verifyPin("1234")).ok);
    await set({ pinSalt: "", pinHash: "", locked: false });
    await sleep(20);
    ok("unlocking from storage (another tab) drops the curtain", !q("#veil-curtain"));

    // SECURITY: aliases are keyed HMAC, not a public hash.
    await set({ aliasNames: true, aliasSecret: "11".repeat(32) });
    await sleep(60);
    const aliasA = name.dataset.veilAlias;
    await set({ aliasSecret: "22".repeat(32) });
    await sleep(60);
    const aliasB = name.dataset.veilAlias;
    ok("security: alias depends on a secret key (can't be reversed by hashing guesses)",
      /^Contact [0-9A-F]{6}$/.test(aliasA) && /^Contact [0-9A-F]{6}$/.test(aliasB) && aliasA !== aliasB, aliasA + " vs " + aliasB);
    await set({ aliasNames: false });

    // SECURITY: malformed stored values are sanitised (no CSS injection).
    const m = VeilSettings.merge({ blurPx: "9px}body{display:none", style: "x}*{color:red", reveal: 3,
      categories: { names: "yes" }, pinHash: "<script>", idleLockMin: -5 });
    ok("security: stored values are type-checked and clamped",
      m.blurPx === 8 && m.style === "blur" && m.reveal === "hover" && m.categories.names === true && m.pinHash === "" && m.idleLockMin === 0);

    // SECURITY: only Veil's own popup can query the content script.
    const foreign = await chrome.runtime._dispatch({ type: "veil:stats" }, { id: "some-other-extension" });
    ok("security: messages from other senders are ignored", foreign === undefined);

    // "Show this chat": reveals the open conversation only.
    await set({ reveal: "hover", revealDelayMs: 0, chatRevealButton: true });
    const btn = q("#veil-chat-btn");
    ok("show-chat: floating button present over the open chat", !!btn && btn.style.display === "block");
    await set({ revealChatToggle: Date.now() });
    await sleep(30);
    const isOpen = () => document.documentElement.hasAttribute("data-veil-chat-open");
    ok("show-chat: open conversation fully revealed (header, messages, photo, typing box)",
      isOpen() && !blurred(msg) && !blurred(hdrName) && !blurred(photo) && !blurred(compose) && !blurred(author));
    ok("show-chat: chat list stays masked", blurred(name) && blurred(prev) && blurred(avatar));
    const hdrTitle = hdrName.getAttribute("title");
    hdrName.setAttribute("title", "Another Chat"); // simulate switching to another chat
    await sleep(30);
    ok("show-chat: switching chats re-masks automatically", !isOpen() && blurred(msg));
    hdrName.setAttribute("title", hdrTitle);
    await sleep(30);
    document.documentElement.setAttribute("data-veil-chat-open", ""); // page tries to unmask itself
    await sleep(10);
    ok("security: page can't reveal a chat by setting the flag", !isOpen() && blurred(msg));
    await set({ revealChatToggle: Date.now() + 1 });
    await sleep(30);
    await set({ locked: true });
    ok("show-chat: lock screen re-masks the chat", !isOpen());
    await set({ locked: false });
    await sleep(30);
    await set({ reveal: "none" });
    ok("show-chat: button hidden in Presenter/never-reveal mode", q("#veil-chat-btn").style.display === "none");
    await set({ reveal: "hover", revealDelayMs: D.revealDelayMs });

    // Coverage report has numbers only.
    const stats = await chrome.runtime.sendMessage({ type: "veil:stats" });
    ok("coverage report counts every category, numbers only", Object.values(stats.counts).every((v) => typeof v === "number") &&
      stats.counts.messages > 0 && !/Priya|Asha|order/.test(JSON.stringify(stats)), JSON.stringify(stats.counts));

    await set(Object.assign({}, D, { categories: Object.assign({}, D.categories) }));
    const failed = results.filter((r) => !r.pass);
    return { passed: results.length - failed.length, total: results.length, failed, results };
  };
})();
