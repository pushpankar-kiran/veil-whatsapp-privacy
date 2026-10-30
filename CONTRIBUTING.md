# Contributing

Thanks for your interest in improving Veil! Contributions of all kinds are
welcome: bug reports, feature ideas, docs, and code.

## Ways to help

- 🐛 **Report a bug**: open a [bug report](../../issues/new?template=bug_report.yml). Never include screenshots or text from your real chats. Attach the structure-only report from `tools/dom-probe.js` instead.
- 💡 **Suggest a feature**: open a [feature request](../../issues/new?template=feature_request.yml).
- 🔧 **Send a pull request**: see below.

## Development setup

There is no build step. You need Python 3.10+ for the audit and tests, and
optionally Node.js for syntax checks.

```bash
git clone https://github.com/pushpankar-kiran/veil-whatsapp-privacy.git
cd veil-whatsapp-privacy
pip install playwright
python -m playwright install chromium
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** and select the `extension/` folder
4. After changing code, click the **↻ reload** icon on the extension card, then reload WhatsApp Web

## Checks

```bash
python tools/audit.py        # zero-network audit (fails on any network API or external URL)
python tools/run_checks.py   # 56 behaviour + security checks on a fictional mock page
python tools/package.py      # builds dist/veil-extension.zip
```

You can also open `test/mock.html` through any local server and run
`await veilChecks()` in the console.

## Project layout

```
extension/
  manifest.json      # MV3 manifest: storage permission only, connect-src 'none'
  boot.css           # fail-closed shield: blurs the page until the mask is ready
  content.js         # tagger, mask CSS, reveal modes, curtain, "Show this chat"
  notify-guard.js    # MAIN-world wrapper that scrubs desktop notifications
  settings.js        # settings schema, validation, PIN hashing
  background.js      # keyboard shortcuts
  popup.*            # toolbar popup
  PRIVACY.md         # privacy policy
tools/               # audit.py, run_checks.py, package.py, dom-probe.js, make_icons.py
test/                # mock.html (fictional WhatsApp-like DOM), chrome-shim.js, checks.js
docs/                # README images, competitive gap analysis
```

## Pull request guidelines

- Keep changes focused; one topic per PR.
- Match the existing code style (no linter is enforced; just read the surrounding code).
- **Selectors must use ids, ARIA roles, `data-*` attributes or URL shapes, never
  WhatsApp's generated class names.** Those change with every WhatsApp release.
- No network APIs, remote code, or new permissions. `tools/audit.py` enforces this and CI runs it.
- Add a check to `test/checks.js` for any behaviour change, and make sure `python tools/run_checks.py` passes.
- Update the `README.md` and `CHANGELOG.md` if your change is user-visible.

## Reporting security issues

Please **do not** open a public issue for security problems. See [SECURITY.md](SECURITY.md).
