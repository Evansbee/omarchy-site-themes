#!/usr/bin/env node

// Generates extension/sites/youtube-music-rules.css. YouTube Music sets fixed
// colors in many component rules (white titles, #aaa bylines, white
// --yt-endpoint-color). It adds that CSS from JavaScript, so this opens the
// site in headless Chrome with a throwaway profile, reads every rule, and
// maps each fixed color onto the palette with extension/palette.js. The
// output uses only --om-* variables, so it fits every theme. Re-run after a
// YouTube Music redesign:
//
//   tools/gen-youtube-music.mjs                   # google-chrome-stable
//   CHROME=chromium tools/gen-youtube-music.mjs   # or another Chromium browser

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "extension/sites/youtube-music-rules.css");
// Not $BROWSER: Omarchy sets it to omarchy-launch-browser, which can start
// Firefox. Firefox ignores --user-data-dir and locks the default profile.
const BROWSER = process.env.CHROME || "google-chrome-stable";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page after palette.js. Returns the CSS text.
function collect() {
  const P = globalThis.OmarchyPalette;
  // YouTube Music's dark page background and text. Its red brand becomes the accent.
  const ctx = { bgL: P.lightness(P.parse("#0f0f0f")), fgL: P.lightness(P.parse("#ffffff")), brandHue: 0 };
  const ROLES = {
    color: "fg", fill: "fg", stroke: "fg", "caret-color": "fg",
    "background-color": "bg", "background-image": "bg",
    "border-top-color": "border", "border-right-color": "border",
    "border-bottom-color": "border", "border-left-color": "border", "outline-color": "border",
  };
  // Root tokens (html, :root) are mapped by hand in youtube-music.css.
  const isRoot = (sel) => sel.split(",").every((s) => /^(html|:root)(\[[^\]]*\])*$/.test(s.trim()));
  const varRole = (name, c) => {
    if (/background|-bg|fill|scrim/i.test(name)) return "bg";
    if (/border|outline|divider|stripe/i.test(name)) return "border";
    const p = (P.lightness(c) - ctx.bgL) / (ctx.fgL - ctx.bgL);
    return p > 0.5 ? "fg" : "bg";
  };
  const seen = new Set();
  const lines = [];
  const walk = (rules, wrap) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) { walk(rule.cssRules, [...wrap, `@media ${rule.conditionText}`]); continue; }
      if (rule instanceof CSSSupportsRule) { walk(rule.cssRules, [...wrap, `@supports ${rule.conditionText}`]); continue; }
      if (!(rule instanceof CSSStyleRule) || isRoot(rule.selectorText)) continue;
      const body = [];
      for (const prop of rule.style) {
        const value = rule.style.getPropertyValue(prop).trim();
        if (!value || value.includes("var(") || value.includes("url(")) continue;
        const colors = P.colorsIn(value);
        if (!colors.length || colors.every((c) => c[3] === 0)) continue;
        const role = prop.startsWith("--") ? varRole(prop, colors[0]) : ROLES[prop];
        if (!role) continue;
        const mapped = P.remapValue(value, role, ctx);
        if (mapped) body.push(`${prop}: ${mapped} !important;`);
      }
      if (!body.length) continue;
      const scoped = rule.selectorText.split(",").map((s) => {
        s = s.trim();
        return /^html\b/.test(s) ? s.replace(/^html/, "html[data-omarchy-themed]") : `html[data-omarchy-themed] ${s}`;
      }).join(",\n");
      const text = wrap.reduceRight((inner, at) => `${at} { ${inner} }`, `${scoped} { ${body.join(" ")} }`);
      if (!seen.has(text)) { seen.add(text); lines.push(text); }
    }
  };
  for (const sheet of document.styleSheets) {
    if (/^omarchy-/.test(sheet.ownerNode?.id || "")) continue;
    try { walk(sheet.cssRules, []); } catch {}
  }
  for (const sheet of document.adoptedStyleSheets || []) walk(sheet.cssRules, []);
  return { dark: document.documentElement.hasAttribute("dark"), css: lines.join("\n") };
}

const dir = mkdtempSync(join(tmpdir(), "gen-ytm-"));
const proc = spawn(BROWSER, [
  "--headless=new", `--user-data-dir=${dir}`, "--remote-debugging-port=0",
  "--window-size=1400,1000", "--no-first-run", "about:blank",
], { stdio: "ignore" });

try {
  // Port 0: Chromium picks a free port and writes it to DevToolsActivePort.
  let targets, last;
  for (let i = 0; i < 50 && !targets; i++) {
    try {
      const port = readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n")[0];
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch (e) { last = e; await sleep(200); }
  }
  if (!targets) throw new Error(`${BROWSER} did not start: ${last?.message}`);
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
    return res.result.result.value;
  };

  await send("Network.enable");
  // Headless Chromium's user agent gets an aborted load.
  await send("Network.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  });
  // EU consent wall: the cookie that "Reject all" sets.
  await send("Network.setCookie", {
    name: "SOCS", value: "CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
    domain: ".youtube.com", path: "/", secure: true,
  });
  await send("Page.navigate", { url: "https://music.youtube.com/" });
  await sleep(10000);
  await evaluate(readFileSync(join(ROOT, "extension/palette.js"), "utf8"));
  const { dark, css } = await evaluate(`(${collect})()`);
  if (!dark) throw new Error("YouTube Music did not load in dark mode, nothing written");
  if (css.split("\n").length < 50) throw new Error("too few rules, page did not load? Nothing written");
  writeFileSync(OUT, `/* YouTube Music: generated by tools/gen-youtube-music.mjs from the site's
   component rules with fixed colors. Do not edit by hand. */

${css}
`);
  console.log(`${css.split("\n").length} lines -> ${OUT}`);
  ws.close();
} finally {
  proc.kill();
  await sleep(500);
  rmSync(dir, { recursive: true, force: true });
}
