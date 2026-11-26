# Building OpenShield Pocket

Pocket is the Android remote for a running `openshield serve` instance. The
Svelte frontend and Rust shell live in this repo. The Android Gradle project
is tracked at `src-tauri/gen/android` (`com.openshield.pocket`).

[openshield-mobile](https://github.com/Blackshield-Company/openshield-mobile)
keeps the Pocket design brief (`docs/POCKET.md`) and a mirror of the Gradle
tree. Change the Android sources here, then sync them back to that repo if
the mirror should stay current.

## One command

```sh
./scripts/build-android-apk.sh
```

That installs npm dependencies if needed and runs `npx tauri android build --debug`, which produces a self-signed debug APK under `src-tauri/gen/android/app/build/outputs/apk/`. It does not sign a release build or publish anything.

## Prerequisites (all free)

- Node 20+ and npm
- Rust, with the `aarch64-linux-android` target (`rustup target add aarch64-linux-android`)
- JDK 17 or 21 (Android Gradle Plugin 8.11 is not reliable on newer JDKs such as 27)
- Android SDK and NDK, with `ANDROID_HOME` set (default `~/Android/Sdk`)
  - Platform android-36 (compileSdk/targetSdk in the Gradle project)
  - A recent NDK (27.x is a good match for current Tauri 2)
  - platform-tools if you will use adb

## Device install

Only install over wireless adb when the Pixel is already paired and listed in `adb devices`. This repo does not ship a Play Store build.
