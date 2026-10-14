#!/bin/sh
# Builds build/AF3DN.P (the wrapper) with the 32-bit MinGW cross-compiler.
set -e
mkdir -p "$(dirname "$0")/build"
cd "$(dirname "$0")"
CC=i686-w64-mingw32-gcc
DLLTOOL=i686-w64-mingw32-dlltool

$DLLTOOL -d src/orig_imports.def -l build/libaf3dn_orig.a
$CC -shared -O2 -Wall -Wextra -nostdlib -ffreestanding \
    -Wl,--entry=_DllMain@12 -Wl,--enable-stdcall-fixup \
    -o build/AF3DN.P src/spellext.c src/exports.def \
    -Lbuild -laf3dn_orig -lkernel32 -luser32
echo "built build/AF3DN.P"

# The same mod as a plain DLL, for a mod manager to load (7th Heaven: <LoadLibrary> in mod.xml)
# beside a driver that is not the stock one (FFNx). No driver exports, no stock driver needed.
$CC -shared -O2 -Wall -Wextra -nostdlib -ffreestanding -DSPELLEXT_AS_MOD \
    -Wl,--entry=_DllMain@12 -Wl,--enable-stdcall-fixup \
    -o build/FF7_SpellExt.dll src/spellext.c \
    -lkernel32 -luser32
echo "built build/FF7_SpellExt.dll"
