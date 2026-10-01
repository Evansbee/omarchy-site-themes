#!/bin/bash

# Hook the extension's palette to Omarchy theme changes and generate it once now.
# Loading the extension into Chrome is a one-time manual step (see README).

set -euo pipefail

ROOT=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
SYNC=$ROOT/bin/omarchy-site-themes-sync
HOOK=$(mktemp -d)/omarchy-site-themes

chmod +x "$SYNC"
printf '#!/bin/bash\n\n# Installed by %s\n"%s"\n' "$ROOT/install.sh" "$SYNC" >"$HOOK"
omarchy hook install theme-set "$HOOK"
omarchy hook install font-set "$HOOK"
rm -r "$(dirname "$HOOK")"

"$SYNC"

echo "Palette written to $ROOT/extension/colors.css"
echo "Load $ROOT/extension in chrome://extensions (Developer mode > Load unpacked)."
