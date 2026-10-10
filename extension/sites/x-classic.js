// X: the classic web app (React Native Web) does not use the --x-* tokens
// that x.css remaps. It writes atomic classes with fixed colors into one
// <style> sheet and keeps adding rules to it while you scroll. This maps
// every color rule onto the palette with OmarchyPalette and checks the sheet
// again when its rule count grows. X writes the current display mode's page
// background and text color on <body>, so that pair anchors the lightness
// ladder in light, Dim and Lights out alike. X's blue becomes the accent.

(() => {
  const P = globalThis.OmarchyPalette;
  const CACHE_KEY = "omarchy-site-x-classic";
  const POLL_MS = 1000;
  const ROLES = {
    color: "fg", fill: "fg", stroke: "fg", "caret-color": "fg",
    "text-decoration-color": "fg", "-webkit-text-fill-color": "fg",
    "background-color": "bg", "background-image": "bg",
    "border-top-color": "border", "border-right-color": "border",
    "border-bottom-color": "border", "border-left-color": "border",
    "outline-color": "border",
  };
  const OWN = new Set(["omarchy-site-theme", "omarchy-site-x-classic"]);

  const out = document.createElement("style");
  out.id = "omarchy-site-x-classic";

  function attach(css) {
    if (!css) return;
    if (out.textContent !== css) out.textContent = css;
    // Stay last in <head> so our !important rules beat X's.
    const parent = document.head || document.documentElement;
    if (out.parentNode !== parent || out.nextElementSibling) parent.appendChild(out);
  }

  try { attach(localStorage.getItem(CACHE_KEY)); } catch {}

  function context() {
    const body = document.body?.style;
    const bg = body && P.parse(body.backgroundColor || "");
    const fg = body && P.parse(body.color || "");
    if (!bg || !fg) return null;
    return { bgL: P.lightness(bg), fgL: P.lightness(fg), brandHue: P.hue([29, 155, 240]) };
  }

  function sheets() {
    return [...document.styleSheets].filter((s) => !OWN.has(s.ownerNode?.id));
  }

  function ruleCount() {
    let n = 0;
    for (const s of sheets()) { try { n += s.cssRules.length; } catch {} }
    return n;
  }

  function render(ctx) {
    const lines = [
      "html[data-omarchy-themed] body { background-color: var(--om-bg) !important; color: var(--om-fg) !important; }",
    ];
    const walk = (rules, wrap) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) { walk(rule.cssRules, [...wrap, `@media ${rule.conditionText}`]); continue; }
        if (!(rule instanceof CSSStyleRule)) continue;
        const body = [];
        for (const prop of rule.style) {
          const role = ROLES[prop];
          if (!role) continue;
          const value = rule.style.getPropertyValue(prop);
          // Transparent defaults need no theme, and an !important one would
          // hide the colors X sets inline on buttons.
          if (P.colorsIn(value).every((c) => c[3] === 0)) continue;
          const mapped = P.remapValue(value, role, ctx);
          if (mapped) body.push(`${prop}: ${mapped} !important;`);
        }
        if (!body.length) continue;
        const scoped = rule.selectorText.split(",").map((s) => `html[data-omarchy-themed] ${s.trim()}`).join(", ");
        lines.push(wrap.reduceRight((inner, at) => `${at} { ${inner} }`, `${scoped} { ${body.join(" ")} }`));
      }
    };
    for (const s of sheets()) { try { walk(s.cssRules, []); } catch {} }
    return lines.join("\n");
  }

  // X sets button and hover colors in style="" and rewrites them on hover.
  // The like animation (Lottie) colors its SVG paths with fill="" and
  // stroke="" attributes, which a style beats. A mapped value holds only var()
  // expressions, so mapping it again is a no-op.
  let lastCtx = null;
  function remapInline(el) {
    // <body> holds X's own mode colors, which context() reads. x.css themes it.
    if (!lastCtx || !el.style || el === document.body) return;
    for (let i = el.style.length - 1; i >= 0; i--) {
      const prop = el.style[i];
      const role = ROLES[prop] || (prop.startsWith("border-") && prop.endsWith("-color") ? "border" : null);
      if (!role) continue;
      const mapped = P.remapValue(el.style.getPropertyValue(prop), role, lastCtx);
      if (mapped) el.style.setProperty(prop, mapped, "important");
    }
    for (const attr of ["fill", "stroke"]) {
      const c = el.getAttribute?.(attr) && P.parse(el.getAttribute(attr));
      if (!c) continue;
      // Our own style change fires the observer again: set only a new value, or it loops.
      const mapped = P.mapColor(c, "fg", lastCtx);
      if (el.style.getPropertyValue(attr) !== mapped) el.style.setProperty(attr, mapped, "important");
    }
  }
  function remapTree(root) {
    if (root.nodeType !== 1) return;
    const SEL = "[style], [fill], [stroke]";
    if (root.matches(SEL)) remapInline(root);
    for (const el of root.querySelectorAll(SEL)) remapInline(el);
  }
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") remapInline(r.target);
      else for (const n of r.addedNodes) remapTree(n);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "fill", "stroke"] });

  let seen = -1, ctxKey = "";
  function run() {
    const ctx = context();
    if (!ctx) return;
    const key = `${ctx.bgL}/${ctx.fgL}`;
    const n = ruleCount();
    if (n === seen && key === ctxKey) return;
    const ctxChanged = key !== ctxKey;
    seen = n;
    ctxKey = key;
    lastCtx = ctx;
    if (ctxChanged && document.body) remapTree(document.body);
    const css = render(ctx);
    attach(css);
    try { localStorage.setItem(CACHE_KEY, css); } catch {}
  }

  document.addEventListener("DOMContentLoaded", run);
  setInterval(() => { if (document.visibilityState === "visible") run(); }, POLL_MS);
})();
