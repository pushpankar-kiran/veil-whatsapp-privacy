// Keyboard shortcuts only. Each command writes to chrome.storage.local and the content
// script reacts through storage.onChanged, so no "tabs" or host permission is needed.
importScripts("settings.js");

chrome.commands.onCommand.addListener(async (command) => {
  const s = await VeilSettings.load();
  if (command === "toggle-mask") {
    // With a PIN set, the shortcut can only turn masking ON. Turning it off needs
    // the PIN in the popup, so someone at your keyboard can't just press Alt+Shift+X.
    if (s.pinHash && s.enabled) return;
    await VeilSettings.save({ enabled: !s.enabled });
  } else if (command === "panic-lock") {
    await VeilSettings.save({ enabled: true, locked: true });
  } else if (command === "reveal-chat") {
    await VeilSettings.save({ revealChatToggle: Date.now() });
  } else if (command === "presenter-mode") {
    await VeilSettings.save(VeilSettings.PRESETS.presenter);
  }
});
