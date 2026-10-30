// Minimal in-memory stand-in for the chrome.* APIs Veil uses, so content.js can run
// on the mock page in an ordinary browser tab.
(function () {
  // Persist across reloads like chrome.storage.local (sessionStorage, this tab only).
  let store = {};
  try { store = JSON.parse(sessionStorage.getItem("veil-shim") || "{}"); } catch (_) { /* fresh */ }
  const persist = () => { try { sessionStorage.setItem("veil-shim", JSON.stringify(store)); } catch (_) { /* ignore */ } };
  const changeListeners = [];
  const msgListeners = [];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  window.chrome = {
    storage: {
      local: {
        get(_keys, cb) { setTimeout(() => cb(clone(store)), 0); },
        set(patch, cb) {
          const changes = {};
          for (const [k, v] of Object.entries(patch)) { changes[k] = { newValue: v }; store[k] = clone(v); }
          persist();
          setTimeout(() => { changeListeners.forEach((l) => l(changes, "local")); cb && cb(); }, 0);
        },
      },
      onChanged: { addListener(fn) { changeListeners.push(fn); } },
    },
    tabs: {
      query(_q, cb) { cb([]); },
      sendMessage(_id, _msg, cb) { cb && cb(undefined); },
      create() {},
    },
    runtime: {
      id: "veil-test",
      lastError: undefined,
      onMessage: { addListener(fn) { msgListeners.push(fn); } },
      sendMessage(msg) { return window.chrome.runtime._dispatch(msg, { id: "veil-test" }); },
      // Test hook: deliver a message as if from another sender. Resolves undefined if ignored.
      _dispatch(msg, sender) {
        return new Promise((res) => {
          msgListeners.forEach((l) => l(msg, sender, res));
          setTimeout(() => res(undefined), 50);
        });
      },
    },
  };
  // Record notifications instead of showing them; notify-guard.js wraps this.
  window.__notifications = [];
  window.Notification = function (title, opts) { window.__notifications.push({ title, opts }); };
  window.Notification.permission = "granted";
  window.Notification.requestPermission = () => Promise.resolve("granted");
})();
