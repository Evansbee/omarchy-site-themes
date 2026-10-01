#!/bin/bash

# Remove the theme-set and font-set hooks that install.sh added. Remove the
# extension itself from chrome://extensions.

set -euo pipefail

for hook in theme-set font-set; do
  rm -fv "$HOME/.config/omarchy/hooks/$hook.d/omarchy-site-themes"
done
