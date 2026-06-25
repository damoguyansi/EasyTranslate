#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; SRC="$DIR/icon.png"; ICONSET="$DIR/icon.iconset"
[ -f "$SRC" ] || { echo "错误：$SRC 不存在"; exit 1; }
mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512 1024; do sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" > /dev/null; done
cp "$ICONSET/icon_32x32.png" "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png" "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png" "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png" "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"
rm "$ICONSET/icon_64x64.png" "$ICONSET/icon_1024x1024.png"
iconutil -c icns "$ICONSET" -o "$DIR/icon.icns"
sips -z 22 22 "$SRC" --out "$DIR/tray.png" > /dev/null
rm -rf "$ICONSET"
echo "✅ icon.icns + tray.png 生成完成"
