#!/usr/bin/env bash
# Arcana Rush 1.0 standalone Android app (own app id io.github.muuuuoouuun.arcanarush, decision 2026-11-11).
# The shared capacitor.config.ts / android/ of the Arcana arcade stay untouched; this shell lives here.
# Steps: build the site, copy it with rush.html as the start page, create/sync the Capacitor Android project,
# then build a debug APK when an Android SDK is installed. Accepting the Android SDK licence is the owner's
# legal decision (loop.md); without ANDROID_HOME the script stops right before the Gradle build.
# Usage: bash tools/rush-app/build.sh
set -euo pipefail
APP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"
cd "$ROOT"
npm run build
rm -rf "$APP/www"
cp -r dist "$APP/www"
cp "$APP/www/rush.html" "$APP/www/index.html"
cd "$APP"
CAP="node $ROOT/node_modules/@capacitor/cli/bin/capacitor"
[ -d android ] || $CAP add android
$CAP sync android
# App icons: the 1.0 icon in every launcher density (needs python3 with Pillow; skipped otherwise).
python3 - "$ROOT/public/rush/icon-512.png" android/app/src/main/res <<'PY' || echo "icons: skipped (python3 + Pillow needed)"
import sys, os
from PIL import Image
src, res = Image.open(sys.argv[1]).convert('RGBA'), sys.argv[2]
for d, n in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    folder = os.path.join(res, f'mipmap-{d}')
    os.makedirs(folder, exist_ok=True)
    for name in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'):
        src.resize((n, n), Image.LANCZOS).save(os.path.join(folder, name))
print('icons: written for 5 densities')
PY
if [ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]; then
  echo "Android project ready in $APP/android. Install the Android SDK (accepting its licence), set ANDROID_HOME, then run:"
  echo "  (cd $APP/android && ./gradlew assembleDebug)   # APK: android/app/build/outputs/apk/debug/app-debug.apk"
  exit 0
fi
(cd android && ./gradlew assembleDebug)
ls -l android/app/build/outputs/apk/debug/
