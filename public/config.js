/* Public configuration. Never put a secret key in this file. */
window.Z2PL_CONFIG = Object.freeze({
  // Keep true for design previews. Set false ONLY after configuring the backend.
  previewMode: true,
  apiEndpoint: "/api/interest",
  // Cloudflare Turnstile PUBLIC site key. Secret lives in Pages environment.
  turnstileSiteKey: ""
});
