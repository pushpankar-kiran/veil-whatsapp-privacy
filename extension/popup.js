(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const CAT_LABELS = {
    names: "Names", previews: "Chat previews", messages: "Messages",
    media: "Photos & media", avatars: "Profile photos", compose: "Typing box",
  };
  let s = VeilSettings.merge({});
  let unlocked = false; // PIN entered in this popup session
  const gated = () => !!s.pinHash && !unlocked;

  // Build category toggles once.
  const cats = $("#cats");
  for (const [key, label] of Object.entries(CAT_LABELS)) {
    const l = document.createElement("label");
    l.className = "line";
    l.innerHTML = `<span>${label}<span class="n" data-count="${key}"></span></span>`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "tog";
    cb.addEventListener("change", () => {
      VeilSettings.save({ categories: Object.assign({}, s.categories, { [key]: cb.checked }) });
    });
    cb.dataset.cat = key;
    l.appendChild(cb);
    cats.appendChild(l);
  }

  function render() {
    // With a PIN set, nothing can be weakened (turn off, change, clear PIN) until it's entered.
    $("#gate").hidden = !gated();
    $("#controls").inert = gated();
    $("#enabled").disabled = gated();
    $("#enabled").checked = s.enabled;
    document.querySelectorAll(".seg").forEach((seg) => {
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(s[seg.dataset.key] === b.dataset.v)));
    });
    document.querySelectorAll("input.tog[data-key]").forEach((cb) => (cb.checked = !!s[cb.dataset.key]));
    document.querySelectorAll("input.tog[data-cat]").forEach((cb) => (cb.checked = !!s.categories[cb.dataset.cat]));
    $("#blurPx").value = s.blurPx;
    $("#blurOut").textContent = s.blurPx + "px";
    $("#revealDelayMs").value = s.revealDelayMs;
    $("#delayOut").textContent = s.revealDelayMs + "ms";
    $("#delayLine").style.display = s.reveal === "hover" ? "" : "none";
    $("#idleLockMin").value = String(s.idleLockMin);
    $("#pinState").textContent = s.pinHash ? "PIN set: required to unlock" : "No PIN: any key unlocks";
  }

  $("#enabled").addEventListener("change", (e) => VeilSettings.save({ enabled: e.target.checked }));
  document.querySelectorAll(".seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) VeilSettings.save({ [seg.dataset.key]: b.dataset.v });
    });
  });
  document.querySelectorAll("input.tog[data-key]").forEach((cb) => {
    cb.addEventListener("change", () => VeilSettings.save({ [cb.dataset.key]: cb.checked }));
  });
  $("#blurPx").addEventListener("input", (e) => VeilSettings.save({ blurPx: Number(e.target.value) }));
  $("#revealDelayMs").addEventListener("input", (e) => VeilSettings.save({ revealDelayMs: Number(e.target.value) }));
  $("#idleLockMin").addEventListener("change", (e) => VeilSettings.save({ idleLockMin: Number(e.target.value) }));
  document.querySelectorAll("[data-preset]").forEach((b) => {
    b.addEventListener("click", () => VeilSettings.save(VeilSettings.PRESETS[b.dataset.preset]));
  });
  const lockNow = () => VeilSettings.save({ enabled: true, locked: true }).then(() => window.close());
  $("#lockNow").addEventListener("click", lockNow);
  $("#gateLock").addEventListener("click", lockNow);
  $("#revealChat").addEventListener("click", () => {
    VeilSettings.save({ revealChatToggle: Date.now() }).then(() => window.close());
  });
  $("#gate").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await VeilSettings.verifyPin($("#gatePin").value);
    $("#gatePin").value = "";
    if (r.ok) {
      unlocked = true;
      $("#gateErr").textContent = "";
      render();
    } else {
      $("#gateErr").textContent = r.waitSec ? `Too many wrong PINs. Try again in ${r.waitSec}s.` : `Wrong PIN. ${r.left} left before a wait.`;
    }
  });
  $("#shortcuts").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  $("#pinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (gated()) return;
    const pin = $("#pin").value;
    if (!/^\d{4,12}$/.test(pin)) {
      $("#pinState").textContent = "PIN must be 4–12 digits";
      return;
    }
    $("#pin").value = "";
    unlocked = true; // the person who just set it knows it
    await VeilSettings.setPin(pin);
  });
  $("#pinClear").addEventListener("click", () => {
    if (!gated()) VeilSettings.save({ pinHash: "", pinSalt: "", pinFails: 0, pinLockUntil: 0 });
  });

  // Coverage: ask the WhatsApp tab for element counts (numbers only, never content).
  function status(text, cls) {
    const el = $("#status");
    el.textContent = text;
    el.className = "status " + (cls || "");
  }
  function refreshStats() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { type: "veil:stats" }, (r) => {
        if (chrome.runtime.lastError || !r) {
          status("Open web.whatsapp.com in this tab to see live coverage.");
          document.querySelectorAll("[data-count]").forEach((n) => (n.textContent = ""));
          return;
        }
        $("#revealChat").textContent = r.chatShown ? "Hide current chat" : "Show current chat";
        $("#revealChat").setAttribute("aria-pressed", String(!!r.chatShown));
        $("#revealChat").disabled = !r.chatOpen;
        for (const [k, v] of Object.entries(r.counts)) {
          const n = document.querySelector(`[data-count="${k}"]`);
          if (n) n.textContent = v ? String(v) : "";
        }
        if (!s.enabled) return status("Masking is off. Everything on screen is visible.", "warn");
        const gaps = [];
        if (r.listOpen && s.categories.names && !r.counts.names) gaps.push("names");
        if (r.chatOpen && s.categories.messages && !r.counts.messages) gaps.push("messages");
        if (gaps.length && !s.strict) {
          status(`No ${gaps.join(" or ")} detected. WhatsApp may have changed its layout, so turn on Strict mode to stay covered.`, "warn");
        } else {
          status(r.locked ? "Curtain is up. WhatsApp is locked." : "Protected. Masking is active on this tab.", "ok");
        }
      });
    });
  }

  VeilSettings.load().then((loaded) => {
    s = loaded;
    render();
    refreshStats();
  });
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area !== "local") return;
    VeilSettings.load().then((loaded) => {
      s = loaded;
      render();
      setTimeout(refreshStats, 120);
    });
  });
})();
