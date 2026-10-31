#!/bin/bash
# Builds SpellExt Config from the pinned Electron release zips (design 5.3). No npm, no compiling (except the
# Windows Live-tables helper). Never touches the game folder, the 7th Heaven folder or the installed mod.
#
#   tools/spellext_config_app/build/build.sh [linux] [win]       (both when none is named)
#
# Download once into build/downloads/<version>/ (a folder of its own: the zips are untrusted data), verify twice
# (verify.sh: the release's SHASUMS256.txt and the sha256 pinned here), unpack into a fresh build/out/stage/<platform>
# (only the platforms named are made again), add
# our app folder as resources/app, turn the RunAsNode and Node env fuses off (fuses.py), add the README and the
# example user-templates file, zip with bsdtar into build/out/release/ (zip_release.sh: an earlier zip of the same
# platform is removed first, and SHA256SUMS.txt lists every zip left there).
# The zips are checked by tests/check_release.py (the gate runs it); nothing is published from here.
set -euo pipefail
ELECTRON=v44.7.0
SHA_LINUX=3ae7d5bdad61c664486c6ab61361dd084d064c8c08af8d13a687096e18ce555a   # electron-v44.7.0-linux-x64.zip, seen 2026-10-28
SHA_WIN=eee30dc8fa1f5ea95490e59f44e46ea68dd24c6e93d22facf70fe5c2d4c2665c     # electron-v44.7.0-win32-x64.zip, seen 2026-10-28
# the Live helper's compile flags (tests/check_release.py compiles the .c again with them and wants the same bytes;
# --no-insert-timestamp makes two compiles of one source byte-identical)
HELPER_FLAGS="-O2 -s -municode -Wl,--no-insert-timestamp"
HERE="$(cd "$(dirname "$0")" && pwd)"; APP="$HERE/../app"; OUT="$HERE/out"; DL="$HERE/downloads/$ELECTRON"
REL="$OUT/release"; EXAMPLE="$HERE/../examples/FF7_SpellExt_Templates.txt"
BASE="https://github.com/electron/electron/releases/download/$ELECTRON"
TARGETS=("$@"); [ ${#TARGETS[@]} -gt 0 ] || TARGETS=(linux win)
for t in "${TARGETS[@]}"; do
  case "$t" in linux|win) ;; *) echo "build.sh: unknown target $t (linux, win)" >&2; exit 2 ;; esac
done
want() { local x; for x in "${TARGETS[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
if want win && [ ! -f "$APP/helper/sxlive_helper.c" ]; then
  echo "build.sh: win needs app/helper/sxlive_helper.c (the Live tables helper, stage S6); build linux only until then" >&2
  exit 2
fi
mkdir -p "$DL"
files=(SHASUMS256.txt)
want linux && files+=("electron-$ELECTRON-linux-x64.zip")
want win && files+=("electron-$ELECTRON-win32-x64.zip")
for f in "${files[@]}"; do
  if [ ! -f "$DL/$f" ]; then curl -fL --retry 3 -o "$DL/$f.part" "$BASE/$f"; mv "$DL/$f.part" "$DL/$f"; fi
done
"$HERE/verify.sh" "$DL" "$ELECTRON" "$SHA_LINUX" "$SHA_WIN" "${TARGETS[@]}"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$APP/package.json")"
[ -n "$VERSION" ] || { echo "build.sh: no version in app/package.json" >&2; exit 2; }
# only the stage folder of each platform built is made afresh: "build.sh linux" leaves the Windows stage as it was
mkdir -p "$OUT/stage"
copy_app() {   # our app folder, without what is not shipped; the example user-templates file beside the README
  cp -r "$APP" "$1/resources/app"
  find "$1/resources/app" -name '__pycache__' -prune -exec rm -rf {} +
  mkdir -p "$1/examples"; cp "$EXAMPLE" "$1/examples/FF7_SpellExt_Templates.txt"
}
if want linux; then
  L="$OUT/stage/SpellExt_Config_linux64"; rm -rf "$L"; mkdir -p "$L"
  unzip -q "$DL/electron-$ELECTRON-linux-x64.zip" -d "$L"
  rm -f "$L/resources/default_app.asar"; mv "$L/electron" "$L/spellext-config"
  python3 -I "$HERE/fuses.py" "$L/spellext-config"          # RunAsNode and the Node env fuses off; stops unless the sentinel is found once
  python3 -I "$HERE/fuses.py" --check "$L/spellext-config"
  copy_app "$L"; rm -rf "$L/resources/app/helper"            # the helper is Windows only
  cp "$HERE/README_linux.txt" "$L/README.txt"
fi
if want win; then
  W="$OUT/stage/SpellExt_Config_win64"; rm -rf "$W"; mkdir -p "$W"
  unzip -q "$DL/electron-$ELECTRON-win32-x64.zip" -d "$W"
  rm -f "$W/resources/default_app.asar"; mv "$W/electron.exe" "$W/SpellExt Config.exe"
  python3 -I "$HERE/fuses.py" "$W/SpellExt Config.exe"
  python3 -I "$HERE/fuses.py" --check "$W/SpellExt Config.exe"
  copy_app "$W"
  x86_64-w64-mingw32-gcc $HELPER_FLAGS -o "$W/resources/app/helper/sxlive_helper.exe" "$APP/helper/sxlive_helper.c" -lpsapi
  rm -f "$W/resources/app/helper/sxlive_helper.c"
  cp "$HERE/README_windows.txt" "$W/README.txt"
fi
# zips (bsdtar writes zip; the tests and build folders are not shipped)
zt=(); want linux && zt+=(linux); want win && zt+=(win)
"$HERE/zip_release.sh" "$OUT/stage" "$REL" "$VERSION" "${zt[@]}"
