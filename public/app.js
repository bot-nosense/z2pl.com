/* Z2PL landing page. No framework, no tracking, no browser-stored personal data. */
(() => {
  "use strict";
  const config = window.Z2PL_CONFIG || {};
  const preview = config.previewMode !== false || location.protocol === "file:";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const forms = { waitlist: $("#waitlist-form"), feedback: $("#feedback-form") };
  const pendingIds = new WeakMap();
  let turnstileLoader;

  $("#copyright-year").textContent = String(new Date().getFullYear());
  $$("[data-preview]").forEach((element) => { element.hidden = !preview; });

  function announce(kind, state, title, description) {
    const target = $(`#${kind}-status`);
    const heading = document.createElement("strong");
    const detail = document.createElement("span");
    heading.textContent = title;
    detail.textContent = description;
    target.replaceChildren(heading, detail);
    target.dataset.state = state;
    target.hidden = false;
    target.focus({ preventScroll: true });
  }

  function fieldError(input, id, message = "") {
    const note = document.getElementById(id);
    note.textContent = message;
    note.hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function isEmail(value) {
    return value.length <= 254 && /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(value);
  }

  function validate(kind, form) {
    const email = form.elements.email;
    const value = email.value.trim();
    let firstInvalid = null;
    const error = (input, id, message) => {
      fieldError(input, id, message);
      if (message && !firstInvalid) firstInvalid = input;
    };
    if (kind === "waitlist") {
      error(email, "signup-email-error", isEmail(value) ? "" : "Please enter a valid email address.");
      error(form.elements.consent, "signup-consent-error", form.elements.consent.checked ? "" : "Please confirm that you’d like to receive launch updates.");
    } else {
      const message = form.elements.message.value.trim();
      error(form.elements.message, "feedback-message-error", message.length < 3 || message.length > 2000 ? "Please share a little more — between 3 and 2,000 characters." : "");
      error(email, "feedback-email-error", value && !isEmail(value) ? "Please enter a valid email, or leave this field empty." : "");
      error(form.elements.updates, "feedback-updates-error", form.elements.updates.checked && !value ? "Add your email above to receive launch updates, or uncheck this option." : "");
    }
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  function makeId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function getPayload(kind, form) {
    const values = new FormData(form);
    const data = {
      kind,
      email: String(values.get("email") || "").trim(),
      message: kind === "feedback" ? String(values.get("message") || "").trim() : "",
      topic: kind === "feedback" ? String(values.get("topic") || "idea") : "",
      updates: kind === "waitlist" || form.elements.updates.checked,
      consent: kind === "waitlist" ? form.elements.consent.checked : form.elements.updates.checked,
      website: String(values.get("website") || "")
    };
    // Keep the same ID only for retries of exactly the same payload.
    const signature = JSON.stringify(data);
    let attempt = pendingIds.get(form);
    if (!attempt || attempt.signature !== signature) {
      attempt = { signature, id: makeId() };
      pendingIds.set(form, attempt);
    }
    return { ...data, submissionId: attempt.id };
  }

  function setBusy(form, busy) {
    form.setAttribute("aria-busy", String(busy));
    $$("input, textarea, button[type=submit]", form).forEach((field) => { field.disabled = busy; });
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (turnstileLoader) return turnstileLoader;
    turnstileLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        script.remove();
        turnstileLoader = undefined;
        reject(new Error("Security verification could not load. Check your connection and try again."));
      }, 15000);
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => {
        clearTimeout(timer); script.remove(); turnstileLoader = undefined;
        reject(new Error("Security verification is unavailable. Check your connection or content blocker, then try again."));
      };
      document.head.appendChild(script);
    });
    return turnstileLoader;
  }

  async function challengeToken(kind) {
    await loadTurnstile();
    if (!window.turnstile) throw new Error("Security verification is unavailable. Please try again.");
    return new Promise((resolve, reject) => {
      let widget;
      let settled = false;
      const finish = (error, token) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Do not remove a widget inside the callback's own rendering stack.
        setTimeout(() => { if (widget != null) window.turnstile.remove(widget); }, 0);
        if (error) reject(error); else resolve(token);
      };
      const timer = setTimeout(() => finish(new Error("The security check timed out. Please try again.")), 120000);
      try {
        widget = window.turnstile.render(`#${kind}-challenge`, {
          sitekey: config.turnstileSiteKey,
          action: kind,
          theme: "light",
          size: "flexible",
          execution: "execute",
          appearance: "interaction-only",
          callback: (token) => finish(null, token),
          "error-callback": () => { finish(new Error("The security check failed. Please try again.")); return true; },
          "expired-callback": () => finish(new Error("The security check expired. Please try again.")),
          "timeout-callback": () => finish(new Error("The security check timed out. Please try again."))
        });
        window.turnstile.execute(widget);
      } catch {
        finish(new Error("The security check could not start. Please try again."));
      }
    });
  }

  async function submit(kind, event) {
    event.preventDefault();
    const form = forms[kind];
    if (form.getAttribute("aria-busy") === "true") return;
    if (!validate(kind, form)) return;
    if (preview) {
      announce(kind, "preview", "Preview only — nothing was sent.", "This form isn’t connected yet. Your email and feedback have not been sent or stored. The included backend enables real submissions after setup.");
      return;
    }
    if (!config.apiEndpoint || !config.turnstileSiteKey) {
      announce(kind, "error", "This form isn’t connected yet.", "Please try again later. Your information has not been sent.");
      return;
    }
    let endpoint;
    try {
      endpoint = new URL(config.apiEndpoint, location.href);
      if (endpoint.origin !== location.origin) throw new Error("Unexpected endpoint origin.");
    } catch {
      announce(kind, "error", "This form isn’t connected yet.", "The collection endpoint needs to be configured on this website.");
      return;
    }
    const payload = getPayload(kind, form);
    setBusy(form, true);
    $(`#${kind}-status`).hidden = true;
    try {
      const token = await challengeToken(kind);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      let response;
      let result;
      try {
        response = await fetch(endpoint.href, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ ...payload, turnstileToken: token }),
          signal: controller.signal
        });
        if (!(response.headers.get("content-type") || "").includes("application/json")) {
          throw new Error("This form’s collection service is unavailable. Please try again later.");
        }
        result = await response.json();
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok || result.ok !== true || result.status !== "saved") {
        const errors = {
          400: "Please check your entries and try again.",
          403: "We couldn’t verify this submission. Please retry the security check.",
          409: "Please edit your message and try again with a fresh submission.",
          413: "Your message is too long. Please shorten it and try again.",
          415: "The form could not be submitted. Please refresh and try again.",
          429: "You’ve sent a few messages recently. Please wait 10 minutes and try again.",
          503: "The collection service isn’t available right now. Please try again later."
        };
        throw new Error(errors[response.status] || "We couldn’t confirm your submission. Please try again; your form has been kept.");
      }
      form.reset();
      pendingIds.delete(form);
      updateCount();
      if (kind === "waitlist") {
        announce(kind, "success", "You’re on the list.", "Thanks for being part of what comes next. Your email is saved for Z2PL launch and early-access updates.");
      } else {
        announce(kind, "success", "Your thoughts are with us.", payload.updates ? "Thank you for helping shape Z2PL. Your feedback is saved, and you’re also on the launch-update list." : "Thank you for helping shape Z2PL. Your feedback is saved. No launch-email subscription was added.");
      }
    } catch (error) {
      const description = error.name === "AbortError" || error instanceof TypeError
        ? "We couldn’t confirm your submission. Check your connection and try again. Your form has been kept."
        : error.message || "Something went wrong. Your form has been kept; please try again.";
      announce(kind, "error", "Let’s try that again.", description);
    } finally {
      setBusy(form, false);
    }
  }

  function updateCount() {
    $("#message-count").textContent = `${forms.feedback.elements.message.value.length.toLocaleString("en-US")} / 2,000`;
  }
  forms.feedback.elements.message.addEventListener("input", updateCount);
  for (const [kind, form] of Object.entries(forms)) {
    form.addEventListener("submit", (event) => { void submit(kind, event); });
    form.addEventListener("input", (event) => {
      const target = event.target;
      if (target.getAttribute("aria-invalid") === "true") {
        const errorId = target.getAttribute("aria-describedby");
        if (errorId && document.getElementById(errorId)) fieldError(target, errorId);
      }
    });
    // Forms start inert: without JS they cannot accidentally send personal data
    // to the current URL via the browser's default GET form behavior.
    form.removeAttribute("inert");
  }

  const formatDescriptions = {
    pdf: "A document. Ready to share.",
    svg: "A vector. Room to scale.",
    png: "An image. Easy to use."
  };
  const formatButtons = $$("[data-format]");
  formatButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const format = button.dataset.format;
      formatButtons.forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
      $("#output-filename").textContent = `shipping-label.${format}`;
      $("#output-caption").textContent = formatDescriptions[format];
      $("#format-announcement").textContent = `${format.toUpperCase()} example selected. ${formatDescriptions[format]} This is an illustrative preview, not a live conversion.`;
      if (!reducedMotion && $(".shipping-label").animate) {
        $(".shipping-label").animate([{ opacity: .55 }, { opacity: 1 }], { duration: 240 });
      }
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
      formatButtons[next].focus(); formatButtons[next].click();
    });
  });

  $$("[data-focus-email]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    $("#signup").scrollIntoView({ block: "center", behavior: reducedMotion ? "instant" : "smooth" });
    $("#signup-email").focus({ preventScroll: true });
  }));

  const dialog = $("#privacy-dialog");
  let dialogTrigger;
  $$(".privacy-trigger").forEach((button) => button.addEventListener("click", () => {
    dialogTrigger = button;
    dialog.showModal();
  }));
  $("#privacy-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { if (dialogTrigger) dialogTrigger.focus({ preventScroll: true }); });
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
})();
