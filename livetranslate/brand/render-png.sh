#!/usr/bin/env bash
# Exporta os PNGs transparentes em alta resolução a partir dos wrappers HTML (render/).
# Usa o Chromium do Playwright em modo headless. Rode a partir da pasta brand/: bash render-png.sh
set -e
cd "$(dirname "$0")"
CH="$LOCALAPPDATA/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
W=$(cygpath -w "$PWD")
M=$(cygpath -m "$PWD")
r() {
  local html="$1" size="$2" out="$3"
  "$CH" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 --virtual-time-budget=5000 \
    --window-size="$size" --screenshot="${W}\\png\\${out}" \
    "file:///${M}/render/${html}.html" 2>&1 | grep -i "written" || echo "FALHOU: $out"
}
r mark-color 4096,4096 mark-color-4096.png
r mark-black 4096,4096 mark-black-4096.png
r mark-white 4096,4096 mark-white-4096.png
r lockup-color 4096,2276 lockup-color-4096w.png
r lockup-black 4096,2276 lockup-black-4096w.png
r lockup-white 4096,2276 lockup-white-4096w.png
r lockup-horizontal-color 4096,788 lockup-horizontal-color-4096w.png
r lockup-horizontal-black 4096,788 lockup-horizontal-black-4096w.png
r lockup-horizontal-white 4096,788 lockup-horizontal-white-4096w.png
r preview-dark-lockup 1800,1000 PREVIEW-fundo-escuro-lockup.png
r preview-dark-mark 1000,1000 PREVIEW-fundo-escuro-mark.png
