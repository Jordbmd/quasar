#!/bin/sh
set -eu

# Keep Electron's sandbox enabled, including when user namespaces are unavailable.
# Do not use electron-builder's automatic --no-sandbox fallback.
quasar_dir="${APPDIR:-$(dirname "$(readlink -f "$0")")}"
export LD_LIBRARY_PATH="$quasar_dir/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$quasar_dir/quasar" "$@"
