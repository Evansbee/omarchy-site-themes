// Map sites (Google Maps, Waze): the map is a canvas or a grid of image
// tiles, so CSS colors do not reach it. This adds an SVG filter that recolors
// the map with the palette. It inverts the lightness and keeps the hue: white
// land becomes --om-bg, black labels become --om-fg, and water, parks and
// traffic keep their colors. Each output channel is a linear function of the
// input, so one feColorMatrix does it:
//   out = bg + (fg - bg) * (1 - L) + K * (c - L),  L = luma of c
// A light theme works the same way (white land becomes the light --om-bg).
// The matrix is computed from the live --om-bg and --om-fg, so a theme change
// recolors the map within POLL_MS.

(() => {
  const P = globalThis.OmarchyPalette;
  const ID = "omarchy-map";
  const POLL_MS = 1000;
  const LUMA = [0.2126, 0.7152, 0.0722];
  const K = 0.65; // share of each color's hue offset that stays

  // mark: elements to filter that CSS cannot select (generated class names).
  // skip: URLs where the map is a photo (Google satellite and Street View).
  const SITES = {
    "www.google.com": {
      selector: "canvas[data-omarchy-map]",
      mark: () => {
        for (const c of document.getElementsByTagName("canvas")) {
          if (c.hasAttribute("data-omarchy-map")) continue;
          const r = c.getBoundingClientRect();
          if (r.width >= 400 && r.height >= 300) c.setAttribute("data-omarchy-map", "");
        }
      },
      skip: (url) => /!1e3|,3a,/.test(url),
    },
    "www.waze.com": {
      selector: ".olLayerGrid > img.olTileImage",
    },
  };
  const site = SITES[location.hostname];
  if (!site) return;

  const root = document.documentElement;
  const style = document.createElement("style");
  style.id = "omarchy-site-map";
  style.textContent = `html[data-omarchy-themed]:not([data-omarchy-map-off]) ${site.selector} { filter: url(#${ID}) !important; }`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = `<filter id="${ID}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>`;
  const matrix = svg.querySelector("feColorMatrix");

  function values(bg, fg) {
    const rows = [];
    for (let ch = 0; ch < 3; ch++) {
      const b = bg[ch] / 255, f = fg[ch] / 255;
      const row = LUMA.map((w, j) => -(f - b + K) * w + (j === ch ? K : 0));
      rows.push(...row, 0, f);
    }
    rows.push(0, 0, 0, 1, 0);
    return rows.map((v) => +v.toFixed(4)).join(" ");
  }

  let last = "";
  function update() {
    const cs = getComputedStyle(root);
    const bg = P.parse(cs.getPropertyValue("--om-bg"));
    const fg = P.parse(cs.getPropertyValue("--om-fg"));
    if (bg && fg) {
      const v = values(bg, fg);
      if (v !== last) { matrix.setAttribute("values", v); last = v; }
    }
    root.toggleAttribute("data-omarchy-map-off", !!site.skip?.(location.href));
    site.mark?.();
    const parent = document.head || root;
    if (style.parentNode !== parent) parent.appendChild(style);
    if (document.body && svg.parentNode !== document.body) document.body.appendChild(svg);
  }

  update();
  document.addEventListener("DOMContentLoaded", update);
  setInterval(() => { if (document.visibilityState === "visible") update(); }, POLL_MS);
})();
