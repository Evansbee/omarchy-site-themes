// WhatsApp Web: colors come from CSS variables in many groups. body.dark and
// html.xfmqtgv hold the dark mode set (--WDS-*, --app-background, ...), :root
// holds defaults, and StyleX class groups (hashed names such as .x1htcrp8)
// set colors again for parts of the page. The names change with WhatsApp's
// builds, so this maps them at runtime: it reads every rule, maps each fixed
// color (variables and color properties) onto the palette, and appends the
// result with the same selectors and !important. The output uses only --om-* variables, so a theme change
// recolors the page live. The ladder runs from WhatsApp's dark surface
// (#161717) to its text (#FAFAFA). Its green becomes the accent. StyleX adds
// rules while the app runs, so the rule count is checked every second.
// Omarchy's whatsapp-slim extension keeps WhatsApp in system (dark) mode.

(() => {
  const P = globalThis.OmarchyPalette;
  const CACHE_KEY = "omarchy-site-whatsapp";
  const POLL_MS = 1000;
  const COLOR_PROPS = new Set([
    "color", "fill", "stroke", "caret-color", "background-color", "background-image",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color",
  ]);
  const ctx = {
    bgL: P.lightness(P.parse("#161717")),
    fgL: P.lightness(P.parse("#fafafa")),
    brandHue: P.hue(P.parse("#21c063")),
  };
  const OWN = new Set(["omarchy-site-theme", "omarchy-site-whatsapp"]);

  const out = document.createElement("style");
  out.id = "omarchy-site-whatsapp";

  function attach(css) {
    if (!css) return;
    if (out.textContent !== css) out.textContent = css;
    // Stay last in <head> so our !important rules beat WhatsApp's.
    const parent = document.head || document.documentElement;
    if (out.parentNode !== parent || out.nextElementSibling) parent.appendChild(out);
  }

  try { attach(localStorage.getItem(CACHE_KEY)); } catch {}

  // Grays map linearly by their place between WhatsApp's dark surface and its
  // text. WhatsApp uses one variable for text, fills and borders alike (the
  // StyleX variable --xkbennp is its default text color), and draws some areas
  // light even in dark mode (the login card: white with #1d1f1f text). A
  // linear map keeps every light/dark pair WhatsApp designed, so contrast holds
  // everywhere. Colorful values snap to the palette hues (green to the accent):
  // light ones as ink, dark ones as tints.
  const COLOR_RE = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b(?:white|black|transparent)\b/gi;
  function mapColor(c) {
    const p = (P.lightness(c) - ctx.bgL) / (ctx.fgL - ctx.bgL);
    if (P.isColorful(c)) return P.mapColor(c, p > 0.5 ? "fg" : "bg", ctx);
    if (c[3] === 0) return "transparent";
    let expr = p > 1.02 ? "var(--om-fg-strong)"
      : p <= 0 ? "var(--om-bg)"
      : `color-mix(in srgb, var(--om-fg) ${Math.min(100, Math.round(p * 100))}%, var(--om-bg))`;
    if (c[3] < 1) expr = `color-mix(in srgb, ${expr} ${Math.round(c[3] * 100)}%, transparent)`;
    return expr;
  }
  function mapValue(value) {
    let changed = false;
    const out = value.replace(COLOR_RE, (token) => {
      const c = P.parse(token);
      if (!c) return token;
      changed = true;
      return mapColor(c);
    });
    return changed ? out : null;
  }

  // Put the gate on <html>: ":root" and "html" parts become the gated html,
  // anything else gets it as an ancestor.
  function scope(selector) {
    return selector.split(",").map((s) => {
      s = s.trim();
      if (/^:root\b/.test(s)) return s.replace(/^:root/, "html[data-omarchy-themed]");
      if (/^html\b/.test(s)) return s.replace(/^html/, "html[data-omarchy-themed]");
      if (/^[.#\w-]+:root$/.test(s)) return `html[data-omarchy-themed]${s.replace(/:root$/, "")}`;
      return `html[data-omarchy-themed] ${s}`;
    }).join(", ");
  }

  function eachRule(rules, fn, wrap = []) {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) eachRule(rule.cssRules, fn, [...wrap, `@media ${rule.conditionText}`]);
      else if (rule instanceof CSSSupportsRule) eachRule(rule.cssRules, fn, [...wrap, `@supports ${rule.conditionText}`]);
      else if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) eachRule(rule.cssRules, fn, wrap);
      else if (rule instanceof CSSStyleRule) fn(rule, wrap);
    }
  }

  function render() {
    const sheets = [...document.styleSheets].filter((s) => !OWN.has(s.ownerNode?.id));
    const each = (fn) => { for (const sheet of sheets) { try { eachRule(sheet.cssRules, fn); } catch {} } };
    const lines = [];
    each((rule, wrap) => {
      const body = [];
      for (const prop of rule.style) {
        const value = rule.style.getPropertyValue(prop).trim();
        if (!value || value.includes("var(") || value.includes("url(")) continue;
        const colors = P.colorsIn(value);
        if (!colors.length || colors.every((c) => c[3] === 0)) continue;
        if (!prop.startsWith("--") && !COLOR_PROPS.has(prop)) continue;
        const mapped = mapValue(value);
        if (mapped) body.push(`${prop}: ${mapped} !important;`);
      }
      if (body.length) lines.push(wrap.reduceRight((inner, at) => `${at} { ${inner} }`, `${scope(rule.selectorText)} { ${body.join(" ")} }`));
    });
    return lines.join("\n");
  }

  function ruleCount() {
    let n = 0;
    for (const sheet of document.styleSheets) {
      if (OWN.has(sheet.ownerNode?.id)) continue;
      try { n += sheet.cssRules.length; } catch {}
    }
    return n;
  }

  let seen = -1;
  function run() {
    const n = ruleCount();
    if (n === seen) return;
    seen = n;
    const css = render();
    attach(css);
    try { localStorage.setItem(CACHE_KEY, css); } catch {}
  }

  document.addEventListener("DOMContentLoaded", run);
  setInterval(() => { if (document.visibilityState === "visible") run(); }, POLL_MS);
})();
