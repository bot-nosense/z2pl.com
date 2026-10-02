# QA — 30 September 2026

## Executed

- **23 individual API cases passed** with mocked D1 and Turnstile bindings. Node's runner reports 24 passing tests because the enclosing parent is also counted.
- **23 browser checks passed** in headless Chromium, including 7 viewport widths: 320, 390, 768, 820, 1024, 1440 and 1920 px.
- Rendered and visually inspected desktop, mobile and tablet screenshots of the actual delivered UI.
- Confirmed no horizontal overflow at the tested widths and no browser script errors.
- Checked empty/invalid signup, explicit consent, anonymous feedback, optional reply email, independent launch opt-in, preview non-submission, mouse/keyboard format selection, dialog open/Escape close, FAQ and signup focus.
- Exercised the frontend's saved response, malformed saved acknowledgment, 403, 429, 503 and network-failure handling using explicit test doubles. Errors preserve the user's draft.
- Ran `node --check` for frontend/backend JavaScript.
- Executed the migration and the actual rate-counter/feedback SQL against local SQLite; checked incrementing `RETURNING`, idempotent feedback retry and conflicting-payload constraints.

## Important scope limits

No Cloudflare resources were created or accessed. No deployment, real Turnstile challenge, real D1 binding, email delivery, Safari/Firefox runtime or screen-reader session was tested. Browser tests load self-contained HTML in memory. Platform mocks are not proof of a working live deployment.

The delivered preview is intentionally non-collecting. Production collection requires the setup and live checks in `DEPLOY.md`. No personal email or feedback was used during tests.

## Re-run

```sh
node scripts/build-preview.mjs
node --test tests/api.test.mjs
python3 tests/browser_test.py
```

Python Playwright and a Chromium installation are required only for the optional browser tests, not for viewing or deploying the frontend. The page itself has no framework/package dependencies. Tests mock external services and must never be used to bypass production verification.
