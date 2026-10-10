// YouTube: most of the UI now reads hashed tokens (--t<16 hex>) instead of
// the --yt-spec-* names youtube.css remaps. The hashes change with YouTube's
// builds, so this finds them at runtime: it reads each token's [dark] value
// from YouTube's stylesheets and maps it onto the palette with
// OmarchyPalette. Grays keep their place between YouTube's page background
// and text, blues become the accent. The result is cached for the next visit.

(() => {
  const P = globalThis.OmarchyPalette;
  const CACHE_KEY = "omarchy-site-yt-tokens";
  const TOKEN = /^--t[0-9a-f]{16}$/;
  // YouTube's dark page background, body text and link blue.
  const ctx = {
    bgL: P.lightness(P.parse("#0f0f0f")),
    fgL: P.lightness(P.parse("#f1f1f1")),
    brandHue: P.hue(P.parse("#3ea6ff")),
  };

  const out = document.createElement("style");
  out.id = "omarchy-site-yt-tokens";

  function attach(css) {
    if (!css) return;
    if (out.textContent !== css) out.textContent = css;
    const parent = document.head || document.documentElement;
    if (out.parentNode !== parent || out.nextElementSibling) parent.appendChild(out);
  }

  try { attach(localStorage.getItem(CACHE_KEY)); } catch {}

  function darkTokens() {
    const found = new Map();
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) walk(rule.cssRules);
        if (!rule.style || !/\[dark\]/.test(rule.selectorText || "")) continue;
        for (const prop of rule.style) {
          if (TOKEN.test(prop)) found.set(prop, rule.style.getPropertyValue(prop).trim());
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch {}
    }
    return found;
  }

  function build() {
    const decls = [];
    for (const [prop, value] of darkTokens()) {
      const c = P.parse(value);
      if (!c) continue;
      // Light values are text and icons, dark ones are fills.
      const p = (P.lightness(c) - ctx.bgL) / (ctx.fgL - ctx.bgL);
      decls.push(`  ${prop}: ${P.mapColor(c, p > 0.5 ? "fg" : "bg", ctx)} !important;`);
    }
    if (!decls.length) return;
    const css = `html[data-omarchy-themed][dark],\nhtml[data-omarchy-themed] [dark] {\n${decls.join("\n")}\n}\n`;
    attach(css);
    try { localStorage.setItem(CACHE_KEY, css); } catch {}
  }

  // YouTube adds its stylesheets while the app boots. Rebuild when new ones
  // arrive, debounced, and stop watching once the page has settled.
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(build, 300); };
  const watch = new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeName === "STYLE" || n.nodeName === "LINK"))) schedule();
  });
  watch.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", () => {
    schedule();
    setTimeout(() => watch.disconnect(), 10000);
  });
})();
