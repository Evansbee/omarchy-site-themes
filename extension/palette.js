// Maps a color from a site's own stylesheet onto the Omarchy palette. The
// result is a CSS expression over the --om-* variables rather than a fixed
// color, so a theme switch recolors the page without recomputing anything.
//
// Neutral colors keep their place on the site's ladder from page background
// (0) to body text (1), re-expressed as a mix of --om-fg into --om-bg. Fills
// are capped low on that ladder and text kept high, so text stays readable
// whatever the site paired it with. Colorful values snap to the nearest
// palette hue, or to --om-accent when they match the site's brand hue, and
// fills of them become tints rather than solid color.

(function (root) {
  const HUES = [
    ["red", 0], ["orange", 28], ["yellow", 52], ["green", 125],
    ["cyan", 185], ["blue", 220], ["magenta", 295], ["red", 360],
  ];
  const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };
  const COLOR_RE = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b(?:white|black|transparent)\b/gi;
  const CHROMA_MIN = 0.18;

  function parse(token) {
    const t = token.trim().toLowerCase();
    if (NAMED[t]) return NAMED[t];
    if (t[0] === "#") {
      let h = t.slice(1);
      if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
      if (h.length !== 6 && h.length !== 8) return null;
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    }
    const m = t.match(/^(rgba?|hsla?)\((.*)\)$/);
    if (!m) return null;
    const parts = m[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.some((p) => !/^-?[\d.]+(%|deg)?$/.test(p))) return null;
    const num = (p, scale) => (p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p));
    const a = parts[3] === undefined ? 1 : num(parts[3], 1);
    if (m[1].startsWith("rgb")) return [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), a];
    return [...hslToRgb(parseFloat(parts[0]), num(parts[1], 1), num(parts[2], 1)), a];
  }

  function hslToRgb(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  // CIE L*, 0..1
  function lightness([r, g, b]) {
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y) / 100;
  }

  function chroma([r, g, b]) {
    return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }

  function hue([r, g, b]) {
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  function hueDistance(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function nearestHue(h) {
    return HUES.reduce((best, cur) => (hueDistance(h, cur[1]) < hueDistance(h, best[1]) ? cur : best))[0];
  }

  function isColorful(c) {
    return chroma(c) >= CHROMA_MIN;
  }

  function mix(v, pct) {
    if (pct >= 100) return v;
    if (pct <= 0) return "var(--om-bg)";
    return `color-mix(in srgb, ${v} ${pct}%, var(--om-bg))`;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // role: "fg" | "bg" | "border". ctx: { bgL, fgL, brandHue }.
  // hint.hue forces the palette hue for colorful values; hint.expr skips mapping.
  function mapColor(c, role, ctx, hint = {}) {
    if (c[3] === 0) return "transparent";
    let expr;
    if (hint.expr) {
      expr = hint.expr;
    } else {
      const span = ctx.fgL - ctx.bgL || 1;
      const p = (lightness(c) - ctx.bgL) / span;
      if (isColorful(c) || hint.hue) {
        const h = hue(c);
        const name = hint.hue
          || (ctx.brandHue != null && hueDistance(h, ctx.brandHue) < 22 ? "accent" : nearestHue(h));
        const v = `var(--om-${name})`;
        if (role === "fg") expr = v;
        else if (role === "border") expr = mix(v, 50);
        else expr = mix(v, p < 0.3 ? 14 : 26);
      } else if (role === "fg") {
        // Text always lands in the readable top of the ladder. Text the site drew
        // in its background color sat on a strong fill, which is now a surface.
        if (p > 1.02 || p < 0.2) expr = "var(--om-fg-strong)";
        else expr = mix("var(--om-fg)", clamp(Math.round(p * 100), 45, 100));
      } else {
        // Fills stay in the bottom of the ladder so any text on them reads.
        const cap = role === "border" ? 40 : 24;
        expr = mix("var(--om-fg)", clamp(Math.round(p * 100), 0, cap));
      }
    }
    if (c[3] < 1) expr = `color-mix(in srgb, ${expr} ${Math.round(c[3] * 100)}%, transparent)`;
    return expr;
  }

  function hasColor(value) {
    COLOR_RE.lastIndex = 0;
    return COLOR_RE.test(value);
  }

  function colorsIn(value) {
    return (value.match(COLOR_RE) || []).map(parse).filter(Boolean);
  }

  // Replace every color literal in a declaration value; null if none changed.
  function remapValue(value, role, ctx, hint) {
    let changed = false;
    const out = value.replace(COLOR_RE, (token) => {
      const c = parse(token);
      if (!c) return token;
      changed = true;
      return mapColor(c, role, ctx, hint);
    });
    return changed ? out : null;
  }

  root.OmarchyPalette = { parse, lightness, chroma, hue, isColorful, hueDistance, mapColor, remapValue, hasColor, colorsIn };
  if (typeof module !== "undefined") module.exports = root.OmarchyPalette;
})(globalThis);
