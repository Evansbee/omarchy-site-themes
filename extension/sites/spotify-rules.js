// Spotify: spotify.css remaps the Encore tokens, but many components use CSS
// module classes with fixed colors (white titles, #b3b3b3 links, #282828 and
// #333 fills). The class names change with each Spotify build, so this maps
// them at runtime: it fetches Spotify's stylesheets (CDN with CORS), maps every
// fixed color onto the palette with OmarchyPalette, and appends the result as
// !important rules. Values that use var() stay with spotify.css. The ladder
// runs from Spotify's dark base (#121212) to white text, and Spotify green
// becomes the accent. The result is cached for the next visit.

(() => {
  const P = globalThis.OmarchyPalette;
  const CACHE_KEY = "omarchy-site-spotify-rules";
  const ROLES = {
    color: "fg", fill: "fg", stroke: "fg", "caret-color": "fg",
    "background-color": "bg", "background-image": "bg", background: "bg",
    "border-color": "border", "border-top-color": "border", "border-right-color": "border",
    "border-bottom-color": "border", "border-left-color": "border", "outline-color": "border",
  };
  const ctx = {
    bgL: P.lightness(P.parse("#121212")),
    fgL: P.lightness(P.parse("#ffffff")),
    brandHue: P.hue(P.parse("#1ed760")),
  };

  const out = document.createElement("style");
  out.id = "omarchy-site-spotify-rules";

  function attach(css) {
    if (!css) return;
    if (out.textContent !== css) out.textContent = css;
    const parent = document.head || document.documentElement;
    if (out.parentNode !== parent || out.nextElementSibling) parent.appendChild(out);
  }

  try { attach(localStorage.getItem(CACHE_KEY)); } catch {}

  function render(rules, wrap, lines) {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) { render(rule.cssRules, [...wrap, `@media ${rule.conditionText}`], lines); continue; }
      if (rule instanceof CSSSupportsRule) { render(rule.cssRules, [...wrap, `@supports ${rule.conditionText}`], lines); continue; }
      if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) { render(rule.cssRules, wrap, lines); continue; }
      if (!(rule instanceof CSSStyleRule)) continue;
      const body = [];
      for (const prop of rule.style) {
        const role = ROLES[prop];
        if (!role) continue;
        const value = rule.style.getPropertyValue(prop);
        if (value.includes("var(") || value.includes("url(")) continue;
        if (P.colorsIn(value).every((c) => c[3] === 0)) continue;
        const mapped = P.remapValue(value, role, ctx);
        if (mapped) body.push(`${prop}: ${mapped} !important;`);
      }
      if (!body.length) continue;
      const scoped = rule.selectorText.split(",")
        .map((s) => (/^(html|:root)\b/.test(s.trim()) ? s.trim() : `html[data-omarchy-themed] ${s.trim()}`)).join(", ");
      lines.push(wrap.reduceRight((inner, at) => `${at} { ${inner} }`, `${scoped} { ${body.join(" ")} }`));
    }
  }

  const done = new Set();
  let lines = [];

  async function run() {
    const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((l) => l.href).filter((h) => h && !done.has(h));
    if (!hrefs.length) return;
    for (const href of hrefs) {
      done.add(href);
      try {
        const res = await fetch(href);
        if (!res.ok) continue;
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(await res.text());
        render(sheet.cssRules, [], lines);
      } catch {}
    }
    const css = lines.join("\n");
    attach(css);
    try { localStorage.setItem(CACHE_KEY, css); } catch {}
  }

  // Spotify loads more stylesheets when you open other views.
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 300); };
  new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeName === "LINK"))) schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", schedule);
})();
