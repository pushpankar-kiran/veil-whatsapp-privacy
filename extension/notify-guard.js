// Runs in the page's MAIN world at document_start so it can wrap the Notification API
// before WhatsApp captures a reference to it. Rewrites every notification to a generic
// text with no sender, message or photo. The isolated content script turns the guard
// off by setting <html data-veil-notify="off">; with no attribute the guard stays on.
(function () {
  "use strict";
  const guardOn = () => document.documentElement.getAttribute("data-veil-notify") !== "off";

  function scrub(title, options) {
    if (!guardOn()) return [title, options];
    const o = Object.assign({}, options || {});
    o.body = "New message";
    delete o.icon;
    delete o.image;
    delete o.badge;
    return ["WhatsApp", o];
  }

  const Native = window.Notification;
  if (typeof Native === "function") {
    const Veiled = function Notification(title, options) {
      const [t, o] = scrub(title, options);
      return new Native(t, o);
    };
    Veiled.prototype = Native.prototype;
    Object.defineProperty(Veiled, "permission", { get: () => Native.permission });
    Veiled.requestPermission = Native.requestPermission.bind(Native);
    Object.defineProperty(Veiled, "maxActions", { get: () => Native.maxActions });
    window.Notification = Veiled;
  }

  const SWR = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
  if (SWR && typeof SWR.showNotification === "function") {
    const nativeShow = SWR.showNotification;
    SWR.showNotification = function (title, options) {
      const [t, o] = scrub(title, options);
      return nativeShow.call(this, t, o);
    };
  }
})();
