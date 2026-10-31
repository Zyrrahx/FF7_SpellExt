#!/bin/bash
# Checks the downloaded Electron zips twice (design 5.1): against the release's own SHASUMS256.txt, and against the
# sha256 pinned in build.sh (so a replaced SHASUMS256.txt is caught too). Prints what it checked; exit 1 on any
# mismatch or missing line. Called by build.sh; the tests call it on made-up folders to see it refuse.
#
#   build/verify.sh DIR VERSION SHA_LINUX SHA_WIN TARGET...      (TARGET: linux, win)
set -u
DIR="$1"; VER="$2"; SHA_LINUX="$3"; SHA_WIN="$4"; shift 4
[ $# -gt 0 ] || { echo "verify.sh: no target" >&2; exit 2; }
cd "$DIR" || exit 1
[ -f SHASUMS256.txt ] || { echo "verify: no SHASUMS256.txt in $DIR" >&2; exit 1; }
for t in "$@"; do
  case "$t" in
    linux) zip="electron-$VER-linux-x64.zip"; pinned="$SHA_LINUX" ;;
    win)   zip="electron-$VER-win32-x64.zip"; pinned="$SHA_WIN" ;;
    *) echo "verify: unknown target $t" >&2; exit 2 ;;
  esac
  [ -f "$zip" ] || { echo "verify: $zip is missing" >&2; exit 1; }
  # the release's list writes "<sha256> *<name>" (binary mode; "<sha256>  <name>" in text mode); exactly once
  lines="$(grep -E "^[0-9a-f]{64} [ *]$(printf '%s' "$zip" | sed 's/\./\\./g')\$" SHASUMS256.txt)"
  if [ "$(printf '%s\n' "$lines" | grep -c .)" != 1 ]; then
    echo "verify: SHASUMS256.txt does not list $zip exactly once" >&2; exit 1
  fi
  listed="${lines%% *}"
  actual="$(sha256sum "$zip")"; actual="${actual%% *}"
  if [ "$actual" != "$listed" ]; then
    echo "verify: REFUSED $zip: sha256 $actual, the release's SHASUMS256.txt says $listed" >&2; exit 1
  fi
  if [ "$actual" != "$pinned" ]; then
    echo "verify: REFUSED $zip: sha256 $actual, the build script pins $pinned" >&2; exit 1
  fi
  echo "verify: $zip OK ($actual: the release's list and the pinned value agree)"
done
exit 0
