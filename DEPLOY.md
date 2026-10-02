# Enable real collection — Cloudflare Pages + D1

The supplied HTML works offline, but a real signup requires a server and database. This guide configures the included backend; it does not connect to an existing production Z2PL conversion API.

**Do not change the existing Z2PL project, production origin, DNS or repository unless you intend to.** A separate Pages project is the least intrusive way to develop both sites in parallel. Choose the actual hostname yourself. No deployment or paid resource has been created for you.

## 1. Create a separate Pages project and database

Run commands from this package's root. You need Node.js, npm and authorization for your own Cloudflare account. Review any account limits or charges in your account before enabling resources.

```sh
npx wrangler login
npx wrangler pages project create z2pl-landing --production-branch main
npx wrangler d1 create z2pl-interest
```

If you prefer automatic Git deployments, create a Git-integrated Pages project instead of a Direct Upload project. The frontend has no build step; its output directory is `public`. The `functions` directory must be at the Pages project root.

## 2. Configure D1 and the permitted origin

Copy `wrangler.example.toml` to `wrangler.toml`. Replace the database ID with the one returned by D1. Set `ALLOWED_ORIGIN` to the exact HTTPS origin you will use: scheme plus hostname, with no trailing slash or path. The origin must match both the page and the API.

Keep the binding name `DB`. Leave `pages_build_output_dir = "./public"`. Do not deploy the package root as public assets: it contains backend files, tests and configuration.

Apply the schema:

```sh
npx wrangler d1 migrations apply z2pl-interest --remote
```

Only do this on the new database created for this landing page. When integrating with an existing project, review the schema and binding rather than applying commands blindly.

## 3. Configure Turnstile and secrets

Create a Cloudflare Turnstile widget for the chosen landing hostname. Managed mode can be used with the included interaction-only presentation. Put its **public site key** in `public/config.js`.

Set these secrets for the Pages project, using the prompts or the dashboard:

```sh
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name z2pl-landing
npx wrangler pages secret put IP_HASH_KEY --project-name z2pl-landing
```

Use the Turnstile **secret key** for the first secret. For `IP_HASH_KEY`, use a cryptographically random value of at least 32 characters; for example, generate one locally with:

```sh
openssl rand -hex 32
```

Do not paste secrets into `config.js`, a chat, Git or public assets. The backend requires all bindings/secrets and rejects submissions while anything important is missing. Turnstile's server response must match both the hostname and the form's action (`waitlist` or `feedback`). Production code has no verification bypass.

## 4. Turn on the production form and deploy

In `public/config.js`:

```js
window.Z2PL_CONFIG = Object.freeze({
  previewMode: false,
  apiEndpoint: "/api/interest",
  turnstileSiteKey: "YOUR_PUBLIC_TURNSTILE_SITE_KEY"
});
```

Run from the package root, where `functions/` exists:

```sh
npx wrangler pages deploy public --project-name z2pl-landing --branch main
```

Use Wrangler or a correctly configured Git build for this `functions/` layout. Dashboard drag-and-drop does not compile a `functions` directory. Uploading only the HTML or the preview file does not create the collection backend.

The `OPEN-PREVIEW.html` file is intentionally always a non-collecting preview. Do not deploy it as your production page.

## 5. Test the actual deployment before sharing

Use an email you control. Submit with consent and verify a row appears in `subscribers`. Submit anonymous feedback and check that it appears in `feedback` without an added subscriber. Add a reply email to feedback without selecting updates and confirm it is not added to `subscribers`.

Test the live security challenge. Failed/replayed tokens should be rejected. Check that a storage/configuration failure shows an error, not a success message, and preserves the form. Verify the final hostname, origin and Turnstile domain configuration after attaching a custom domain.

The package tests mock Cloudflare services. They do not replace these deployment checks. Rate limits allow 20 validated-shape requests per client-IP-derived key per fixed 10-minute window; a shared office connection shares that allowance. Review this threshold for your audience.

## 6. Read and export the private data

Use D1 Console in your authenticated Cloudflare account, or export privately:

```sh
npx wrangler d1 execute z2pl-interest --remote --json \
  --command "SELECT email, created_at, consent_version, source FROM subscribers ORDER BY created_at DESC;" \
  > subscribers.json

npx wrangler d1 execute z2pl-interest --remote --json \
  --command "SELECT id, topic, message, email, created_at FROM feedback ORDER BY created_at DESC;" \
  > feedback.json

node scripts/export-csv.mjs subscribers.json subscribers.csv
node scripts/export-csv.mjs feedback.json feedback.csv
```

The CSV helper escapes values and mitigates spreadsheet formula injection. It refuses to overwrite an existing export or write into a directory named `public`. Keep the exports private and delete local copies when no longer needed.

## Owner email notifications — Cloudflare only

Notifications go only to **info.bot.nosense@gmail.com**. Cloudflare documents sending to verified Email Routing destinations as free on all plans. This setup uses the Cloudflare REST API from Pages Functions; no extra email provider or separate Worker is needed. Pages Functions and D1 remain subject to their own usage limits.

Configure these in the Cloudflare dashboard:

1. In Email Service → Email Routing → Destination Addresses, add **info.bot.nosense@gmail.com** and click the verification link sent to that Gmail inbox.
2. Configure your sending domain with Cloudflare Email Service. Use an address on that domain for `CF_EMAIL_FROM` (for example, `notifications@z2pl.com` after domain setup).
3. In the Pages project's environment variables, set `CF_EMAIL_ACCOUNT_ID` to your Cloudflare account ID and `CF_EMAIL_FROM` to the sender address.
4. Add `CF_EMAIL_API_TOKEN` as a secret, using a Cloudflare API token with permission to send email for that account. Keep it out of Git and frontend files.
5. Redeploy. Also finish the D1 and Turnstile setup above; hosting the page alone does not enable form submissions.

The recipient is fixed in `lib/notify.js`; form input cannot change it. Email is attempted only after verification and database storage. Notifications are best effort, with no automatic retry queue or email deduplication guarantee. Failures log a generic message without personal data, and submissions remain stored in D1. Verify an actual submission reaches the inbox before relying on email.

Official references: [Free verified destinations](https://developers.cloudflare.com/email-service/platform/pricing/), [Destination verification](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/), [REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/).

## Operating boundaries

- This stores expressions of interest and feedback and optionally emails the owner through Cloudflare Email Service when configured. It does **not** send campaigns, verify email ownership, provide double opt-in, automatically unsubscribe/delete, or include an admin dashboard.
- Before sending a campaign, connect an email platform with the needed verification and unsubscribe workflow. Do not treat unverified submissions as authenticated accounts.
- Feedback email is not marketing consent. Only `subscribers` records reflect explicit launch-update opt-in. The schema records consent version, creation time and source.
- Handle removal requests manually with appropriate ownership verification. Review the on-page data information against your actual process and retention policy.
- The backend never writes raw IP addresses into D1. It keeps window-scoped HMAC rate-limit keys; expired rows are cleaned on subsequent valid-shaped requests. Cloudflare infrastructure may independently process connection data.
- No public data-reading endpoint exists. Do not add a frontend admin page that embeds a database token or secret.
- Add account-level monitoring and additional edge controls if needed for your real traffic. The included throttling and Turnstile are not a complete protection against every abuse pattern.
- Preview branch domains must be configured separately when used for live collection; the backend deliberately restricts submissions to one configured origin.

## Official references

Reviewed 30 September 2026:

- Z2PL product copy: https://z2pl.com/
- Existing playground: https://z2pl.com/playground/
- Pages bindings / D1: https://developers.cloudflare.com/pages/functions/bindings/
- Pages configuration: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Turnstile client rendering: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Required server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Direct Upload and Functions limitations: https://developers.cloudflare.com/pages/get-started/direct-upload/
- D1 database API and transactional batch: https://developers.cloudflare.com/d1/worker-api/d1-database/
