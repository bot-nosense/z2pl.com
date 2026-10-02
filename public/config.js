/* Public configuration. Never put a secret key in this file. */
window.Z2PL_CONFIG = Object.freeze({
  // Public site uses real submissions; missing API configuration fails closed.
  // The standalone OPEN-PREVIEW.html keeps its own non-collecting preview mode.
  previewMode: false,
  apiEndpoint: "/api/interest",
  // Cloudflare Turnstile PUBLIC site key. Secret lives in Pages environment.
  turnstileSiteKey: ""
});
