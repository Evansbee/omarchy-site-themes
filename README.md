# Omarchy Site Themes

A small Chrome extension that recolors Hacker News, Reddit, Google News, and
YouTube with your current Omarchy theme, and follows you when you switch
themes.

## How it works

- `bin/omarchy-site-themes-sync` reads the current theme's `colors.toml` and
  writes the palette to `extension/colors.css` as `--om-*` CSS variables.
- A `theme-set` hook runs the sync script on every `omarchy theme set`.
- The extension's content script loads `colors.css` and re-reads it every
  couple of seconds while a tab is visible. A theme switch shows up in open
  tabs without a reload.
- `extension/sites/*.css` map the palette onto each site. Reddit, YouTube,
  and Google News use design tokens (`--color-*`, `--yt-spec-*`,
  `--gm3-sys-color-*`), so the overrides are mostly variable remaps. Hacker
  News is restyled directly.

## Install

```bash
./install.sh
```

Then, in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this repo's `extension/` directory.

To turn the themes off, disable the extension.

## Adding a site

1. Add a `content_scripts` entry to `extension/manifest.json`.
2. Add the site's match pattern to `web_accessible_resources`.
3. Write `extension/sites/<site>.css`, scoping every rule to
   `html[data-omarchy-themed]`.
4. Click reload on the extension card in `chrome://extensions`.
