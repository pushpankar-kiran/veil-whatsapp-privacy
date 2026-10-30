<!-- Thanks for contributing! Please describe your change. -->

## What does this PR do?

<!-- A short summary of the change and why. -->

## Related issue

<!-- e.g. Fixes #12 -->

## Checklist

- [ ] `python tools/audit.py` passes (zero-network audit)
- [ ] `python tools/run_checks.py` passes (behaviour + security checks)
- [ ] Loaded `extension/` in Chrome and tested the affected path on web.whatsapp.com
- [ ] Selectors use ids, ARIA roles, `data-*` or URL shapes, **never** WhatsApp's generated class names
- [ ] No network APIs, remote code, or new permissions
- [ ] Updated `README.md` / `CHANGELOG.md` if the change is user-visible
