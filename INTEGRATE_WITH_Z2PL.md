# Integration brief for Codex / a developer

## Goal

Add this early-interest landing page alongside the existing Z2PL website. Preserve the existing site's behavior and the user's supplied horse/Z logo. Collect optional anonymous feedback and explicitly consented launch-update email addresses. Do not turn this task into a rewrite of the converter or main website.

## Inspect before editing

Read the actual repository, deployment configuration and existing data-collection services. The site's build/output directory and Pages Functions root must be confirmed from files, not assumed from this brief. Check the working tree for other agents' changes. Do not overwrite uncommitted work.

A standalone `/early-access/` page is a possible location; a separate Pages project/hostname is also possible. Do not change production routing or replace the homepage without the owner's approval. `_web/early-access/` is only a suggested source location if `_web/` is indeed the site's current source directory.

## Preserve

- English UI, continuous light canvas, monochrome sample label, one restrained blue accent.
- Hero: “Your labels. Rendered simply.”
- Supporting line: “One HTTP request converts labels to PDF, SVG or PNG.”
- User-supplied logo; do not substitute an invented icon or generic Z.
- Separate signup and feedback forms. Feedback can be anonymous.
- Launch-email consent is explicit, unchecked by default and separate from permission to reply to feedback.
- Clear preview behavior: no success before actual storage acknowledgment.
- Existing core, conversion API, Playground, authentication and other pages remain unchanged.

## Implementation steps

1. Add `public/index.html`, `styles.css`, `app.js`, `config.js` and assets as an isolated page, keeping relative asset paths correct. Avoid merging this stylesheet globally into an existing application.
2. Reuse an appropriate existing collection backend if one exists and matches the consent/data contract. Otherwise install the included Pages Function and D1 schema after reviewing the deployment setup.
3. If integrating the Function into an existing project, merge route/include and header configuration deliberately. **Do not replace the current site's `_routes.json`, `_headers` or Wrangler file with the supplied standalone versions.** The supplied route file only covers the new endpoint and could break other Functions if copied over wholesale.
4. Configure `/api/interest` or another same-origin endpoint; update `config.js` consistently. Do not send waitlist payloads to the label conversion endpoint.
5. Bind D1 and configure server secrets. The public Turnstile site key is the only key that belongs in the frontend. Verify the expected origin and Turnstile hostname/action validation.
6. Leave `previewMode: true` until storage and verification are ready. Missing secrets/credentials are a deployment blocker, not a reason to add a fake success fallback or browser-only storage.
7. Test with the supplied tests and actual deployed submissions. Confirm no marketing subscription is created from a reply-only feedback email. Confirm retry handling, errors, keyboard navigation and narrow-screen layout.
8. Update the data information text to the owner's real operating process. Do not claim legal compliance or email verification that has not been implemented.
9. Report changed files, test results, deployment status and required owner configuration. Do not claim the page is collecting data until a live submission has been persisted and checked.

The hero format selector is a labeled illustration, not a live conversion tool. Keep that distinction or integrate the real engine explicitly as a separate, tested change. Do not fake download files or successful conversions.
