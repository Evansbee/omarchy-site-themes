// Loads the palette that omarchy-site-themes-sync writes to colors.css and
// marks <html> so the per-site stylesheets switch on. The last palette is kept
// in the page's localStorage so it applies before first paint, then the file
// is re-read whenever the tab is visible, so theme changes land within seconds.

const CACHE_KEY = "omarchy-site-theme";
const ATTR = "data-omarchy-themed";
const MODE_ATTR = "data-omarchy-mode";
const POLL_MS = 2000;

const root = document.documentElement;
const style = document.createElement("style");
style.id = "omarchy-site-theme";

function apply(css) {
  if (!css) return;
  if (style.textContent !== css) style.textContent = css;
  if (!style.isConnected) (document.head || root).appendChild(style);
  if (!root.hasAttribute(ATTR)) root.setAttribute(ATTR, "");
  const mode = css.match(/--om-mode:\s*(\w+)/)?.[1] || "dark";
  if (root.getAttribute(MODE_ATTR) !== mode) root.setAttribute(MODE_ATTR, mode);
}

async function refresh() {
  try {
    const res = await fetch(chrome.runtime.getURL("colors.css"), { cache: "no-store" });
    if (!res.ok) return;
    const css = await res.text();
    apply(css);
    try { localStorage.setItem(CACHE_KEY, css); } catch {}
  } catch {
    // Extension reloaded or colors.css missing; keep what we have.
  }
}

try { apply(localStorage.getItem(CACHE_KEY)); } catch {}
refresh();

// Single-page apps sometimes rewrite <html> attributes or <head>; put ours back.
new MutationObserver(() => {
  if (!style.textContent) return;
  if (!root.hasAttribute(ATTR) || !style.isConnected) apply(style.textContent);
}).observe(root, { attributes: true, attributeFilter: [ATTR], childList: true, subtree: false });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, POLL_MS);
