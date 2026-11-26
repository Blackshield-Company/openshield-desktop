#!/usr/bin/env bash
# Build a debug (self-signed) OpenShield Pocket APK from this tree.
# Requires: Node/npm, Rust with the aarch64-linux-android target, a JDK 17
# or 21, and an Android SDK+NDK (ANDROID_HOME, default ~/Android/Sdk).
# Usage: ./scripts/build-android-apk.sh
# Pass-through args go to `tauri android build` (this script always adds --debug).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d src-tauri/gen/android ]]; then
  echo "src-tauri/gen/android is missing. It should be in this repo on the Pocket branch." >&2
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${HOME}/Android/Sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "Android SDK not found at ${ANDROID_HOME}. Install the SDK and NDK (free) and set ANDROID_HOME." >&2
  exit 1
fi

if ! command -v npm >/dev/null; then
  echo "npm is required." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

npx tauri android build --debug "$@"

echo
echo "Looking for a debug APK..."
mapfile -t apks < <(find src-tauri/gen/android/app/build/outputs/apk -name '*.apk' -type f 2>/dev/null | sort)
if [[ ${#apks[@]} -eq 0 ]]; then
  echo "Build finished, but no APK was found under src-tauri/gen/android/app/build/outputs/apk." >&2
  exit 1
fi
for apk in "${apks[@]}"; do
  echo "  $apk"
done
