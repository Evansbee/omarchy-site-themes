// Recolors sites that hard-code their colors. Reads every stylesheet on the
// page (cross-origin ones through the background worker), maps each color
// declaration onto the palette with OmarchyPalette, and appends the result as
// !important overrides. The output only references --om-* variables, so it is
// cached per site and applied at document_start on the next visit.

(() => {
  const P = globalThis.OmarchyPalette;
  const CACHE_KEY = "omarchy-site-remap";
  const CACHE_MAX = 1_500_000;

  const ROLES = {
    color: "fg", fill: "fg", stroke: "fg", "caret-color": "fg",
    "text-decoration-color": "fg", "-webkit-text-fill-color": "fg",
    "background-color": "bg", "background-image": "bg",
    "border-top-color": "border", "border-right-color": "border",
    "border-bottom-color": "border", "border-left-color": "border",
    "outline-color": "border", "column-rule-color": "border",
  };

  const out = document.createElement("style");
  out.id = "omarchy-site-remap";

  function attach(css) {
    if (out.textContent !== css) out.textContent = css;
    // Stay last in <head> so our !important rules beat the site's.
    const parent = document.head || document.documentElement;
    if (out.parentNode !== parent || out.nextElementSibling) parent.appendChild(out);
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) attach(cached);
  } catch {}

  const parsed = new WeakMap(); // CSSStyleSheet -> entries

  async function rulesOf(sheet) {
    try {
      return sheet.cssRules;
    } catch {
      if (!sheet.href) return null;
      const text = await chrome.runtime.sendMessage({ type: "fetch-css", url: sheet.href }).catch(() => null);
      if (!text) return null;
      const copy = new CSSStyleSheet();
      copy.replaceSync(text);
      return copy.cssRules;
    }
  }

  function collect(rules, wrap, entries) {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const decls = [];
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          const role = ROLES[prop] || (prop.startsWith("--") ? "var" : null);
          if (!role) continue;
          const value = rule.style.getPropertyValue(prop);
          if (P.hasColor(value)) decls.push([prop, role, value]);
          // Page wallpapers fight the theme; drop them.
          else if (prop === "background-image" && value.includes("url(") && isRootSelector(rule.selectorText)) {
            decls.push([prop, "strip", value]);
          }
        }
        if (decls.length) entries.push({ selector: rule.selectorText, wrap, decls });
      } else if (rule instanceof CSSMediaRule) {
        collect(rule.cssRules, [...wrap, `@media ${rule.conditionText}`], entries);
      } else if (rule instanceof CSSSupportsRule) {
        collect(rule.cssRules, [...wrap, `@supports ${rule.conditionText}`], entries);
      } else if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) {
        collect(rule.cssRules, wrap, entries); // unlayered output outranks layers
      }
    }
  }

  function isRootSelector(selector) {
    return selector.split(",").some((s) => /^(html|body|:root)$/i.test(s.trim()));
  }

  // The site's own page background and text color anchor the lightness ladder.
  function context(entries) {
    let bg = [255, 255, 255, 1], fg = [0, 0, 0, 1];
    const hueCounts = new Map();
    for (const { selector, decls } of entries) {
      for (const [prop, role, value] of decls) {
        const colors = P.colorsIn(value);
        if (isRootSelector(selector) && colors[0] && colors[0][3] > 0.5) {
          if (prop === "background-color") bg = colors[0];
          if (prop === "color") fg = colors[0];
        }
        if (role === "var") continue;
        for (const c of colors) {
          if (!P.isColorful(c)) continue;
          const bucket = Math.round(P.hue(c) / 15) % 24;
          hueCounts.set(bucket, (hueCounts.get(bucket) || 0) + 1);
        }
      }
    }
    // The brand is the dominant colorful hue, if one clearly dominates.
    let brandHue = null;
    const total = [...hueCounts.values()].reduce((a, b) => a + b, 0);
    const [top, count] = [...hueCounts].sort((a, b) => b[1] - a[1])[0] || [];
    if (count && count / total >= 0.3) brandHue = top * 15;
    return { bgL: P.lightness(bg), fgL: P.lightness(fg), brandHue };
  }

  function roleForVariable(name, value, ctx) {
    if (/bg|background|surface|canvas|panel|card|fill|shade/i.test(name)) return "bg";
    if (/border|line|divider|outline|rule|stroke/i.test(name)) return "border";
    if (/text|fg|foreground|font|heading|link|ink/i.test(name)) return "fg";
    const c = P.colorsIn(value)[0];
    if (!c) return "fg";
    const p = (P.lightness(c) - ctx.bgL) / (ctx.fgL - ctx.bgL || 1);
    return p < 0.5 ? "bg" : "fg";
  }

  function render(entries, ctx) {
    const lines = ["html { background-color: var(--om-bg); color: var(--om-fg); }"];
    for (const { selector, wrap, decls } of entries) {
      const body = [];
      for (const [prop, role, value] of decls) {
        if (role === "strip") {
          body.push(`${prop}: none !important;`);
          continue;
        }
        const r = role === "var" ? roleForVariable(prop, value, ctx) : role;
        const mapped = P.remapValue(value, r, ctx);
        if (mapped) body.push(`${prop}: ${mapped} !important;`);
      }
      if (!body.length) continue;
      const rule = `${selector} { ${body.join(" ")} }`;
      lines.push(wrap.reduceRight((inner, at) => `${at} { ${inner} }`, rule));
    }
    return lines.join("\n");
  }

  // Colors set in markup: style="", bgcolor="", <font color="">.
  const INLINE = '[style*="color"], [style*="background"], [style*="border"], [bgcolor], font[color]';
  const inlineDone = new WeakSet();
  let lastCtx = null;

  function remapInline(scope, ctx) {
    const els = scope.querySelectorAll ? [...scope.querySelectorAll(INLINE)] : [];
    if (scope.matches?.(INLINE)) els.push(scope);
    for (const el of els) {
      if (inlineDone.has(el)) continue;
      inlineDone.add(el);
      for (let i = el.style.length - 1; i >= 0; i--) {
        const prop = el.style[i];
        const role = ROLES[prop];
        if (!role) continue;
        const mapped = P.remapValue(el.style.getPropertyValue(prop), role, ctx);
        if (mapped) el.style.setProperty(prop, mapped, "important");
      }
      for (const [attr, prop, role] of [["bgcolor", "background-color", "bg"], ["color", "color", "fg"]]) {
        const value = el.getAttribute(attr);
        const c = value && P.parse(value.startsWith("#") || !/^[0-9a-f]{6}$/i.test(value) ? value : `#${value}`);
        if (c) el.style.setProperty(prop, P.mapColor(c, role, ctx), "important");
      }
    }
  }

  let running = false, again = false;

  async function run() {
    if (running) { again = true; return; }
    running = true;
    try {
      const entries = [];
      for (const sheet of document.styleSheets) {
        const id = sheet.ownerNode?.id;
        if (id === "omarchy-site-remap" || id === "omarchy-site-theme") continue;
        if (!parsed.has(sheet)) {
          const rules = await rulesOf(sheet);
          if (!rules) continue;
          const list = [];
          collect(rules, [], list);
          parsed.set(sheet, list);
        }
        entries.push(...parsed.get(sheet));
      }
      if (!entries.length) return;
      const ctx = context(entries);
      const css = render(entries, ctx);
      attach(css);
      lastCtx = ctx;
      if (document.body) remapInline(document.body, ctx);
      try {
        if (css.length < CACHE_MAX) localStorage.setItem(CACHE_KEY, css);
      } catch {}
    } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  }

  let timer;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  }

  document.addEventListener("DOMContentLoaded", schedule);
  window.addEventListener("load", schedule);
  // Stylesheets finishing their download, and ones added later.
  document.addEventListener("load", (e) => { if (e.target.tagName === "LINK") schedule(); }, true);
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n === out || n.nodeType !== 1) continue;
        if (/^(STYLE|LINK)$/.test(n.nodeName)) schedule();
        else if (lastCtx) remapInline(n, lastCtx);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
