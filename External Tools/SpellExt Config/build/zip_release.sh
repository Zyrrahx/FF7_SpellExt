#!/bin/bash
# The release folder's last step of build.sh, kept apart so that tests/unit/build.test.js can run it on a small stage:
# for each platform named, the zip of that platform from any version (and its .contents.txt listing) is removed, the
# new one is written with bsdtar (the tests and build folders are not shipped), and SHA256SUMS.txt then lists every
# zip in the folder (so a version bump, or a build of one platform, leaves one zip per platform, all listed).
#
#   build/zip_release.sh STAGE RELEASE_DIR VERSION linux|win ...
set -euo pipefail
[ $# -ge 4 ] || { echo "zip_release.sh STAGE RELEASE_DIR VERSION linux|win ..." >&2; exit 2; }
STAGE="$(cd "$1" && pwd)"; mkdir -p "$2"; REL="$(cd "$2" && pwd)"; VERSION="$3"; shift 3
for t in "$@"; do
  case "$t" in linux) p=linux64 ;; win) p=win64 ;; *) echo "zip_release.sh: unknown target $t (linux, win)" >&2; exit 2 ;; esac
  [ -d "$STAGE/SpellExt_Config_$p" ] || { echo "zip_release.sh: no $STAGE/SpellExt_Config_$p" >&2; exit 2; }
  rm -f "$REL"/SpellExt_Config_*_"$p".zip "$REL"/SpellExt_Config_*_"$p".zip.contents.txt
  (cd "$STAGE" && bsdtar --format zip --exclude '*/tests' --exclude '*/build' -cf "$REL/SpellExt_Config_${VERSION}_$p.zip" "SpellExt_Config_$p")
done
cd "$REL"; sha256sum SpellExt_Config_*.zip | tee SHA256SUMS.txt
