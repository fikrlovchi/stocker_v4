#!/usr/bin/env bash
# Serverdagi uchta alohida papkani bitta monorepo ostiga ko'chiradi:
#
#   /root/fikrlovchi-panel  →  /root/stocker/panel
#   /root/uzumpdfs          →  /root/stocker/pdfs
#   /root/stocker           →  o'z joyida (server/, android/, desktop/ ...)
#
# Kod GitHub'dan keladi (subtree bilan ko'chirilgan), bu skript esa
# **kodga kirmaydigan** narsalarni ko'chiradi: .env, ma'lumotlar bazasi,
# yuklangan fayllar, OAuth tokenlari — hamda systemd/pm2 sozlamalarini
# yangi yo'llarga o'tkazadi.
#
# Ishlatilishi (root sifatida):
#   bash /root/stocker/deploy/migrate-to-monorepo.sh
#
# Xavfsizlik:
#   • Eski papkalar O'CHIRILMAYDI — `.bak-<sana>` nomi bilan qoladi.
#   • Har qadam tekshiriladi; xato bo'lsa skript to'xtaydi (set -e).
#   • Qaytarish yo'li skript oxirida yozilgan.
set -euo pipefail

STOCKER=/root/stocker
OLD_PANEL=/root/fikrlovchi-panel
OLD_PDFS=/root/uzumpdfs
STAMP=$(date +%Y%m%d-%H%M)

say() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

[ -d "$STOCKER/panel" ] || die "$STOCKER/panel yo'q — avval: cd $STOCKER && git pull"
[ -d "$STOCKER/pdfs" ] || die "$STOCKER/pdfs yo'q — avval: cd $STOCKER && git pull"

say "1/7 Servislarni to'xtatish"
systemctl stop fikrlovchi-panel || true
pm2 stop uzumpdfs || true

say "2/7 Panel ma'lumotlarini ko'chirish"
if [ -d "$OLD_PANEL" ]; then
  cp -a "$OLD_PANEL/.env" "$STOCKER/panel/.env"
  mkdir -p "$STOCKER/panel/data"
  # WAL fayllari bilan birga: panel.db, panel.db-wal, panel.db-shm
  cp -a "$OLD_PANEL"/data/. "$STOCKER/panel/data/" 2>/dev/null || true
else
  echo "  $OLD_PANEL topilmadi — o'tkazib yuborildi"
fi

say "3/7 uzumPDFs ma'lumotlarini ko'chirish"
if [ -d "$OLD_PDFS" ]; then
  cp -a "$OLD_PDFS/.env" "$STOCKER/pdfs/.env"
  # oauth.json va credentials.json — Google kirishi; uploads/ va history.json
  # — yasалган PDF'lar va tarix. Bularsiz servis ishga tushmaydi.
  for f in oauth.json credentials.json history.json; do
    [ -f "$OLD_PDFS/$f" ] && cp -a "$OLD_PDFS/$f" "$STOCKER/pdfs/$f"
  done
  mkdir -p "$STOCKER/pdfs/uploads"
  cp -a "$OLD_PDFS"/uploads/. "$STOCKER/pdfs/uploads/" 2>/dev/null || true
  [ -d "$OLD_PDFS/label-cache" ] && cp -a "$OLD_PDFS/label-cache" "$STOCKER/pdfs/" || true
else
  echo "  $OLD_PDFS topilmadi — o'tkazib yuborildi"
fi

say "4/7 Bog'liqliklarni o'rnatish"
(cd "$STOCKER/panel" && npm ci --omit=dev 2>/dev/null || npm install --omit=dev)
(cd "$STOCKER/pdfs" && npm ci --omit=dev 2>/dev/null || npm install --omit=dev)

say "5/7 systemd unit'ini yangilash (fikrlovchi-panel)"
UNIT=/etc/systemd/system/fikrlovchi-panel.service
if [ -f "$UNIT" ]; then
  cp -a "$UNIT" "$UNIT.bak-$STAMP"
  sed -i "s|WorkingDirectory=.*|WorkingDirectory=$STOCKER/panel|" "$UNIT"
  sed -i "s|ExecStart=.*|ExecStart=/usr/bin/node $STOCKER/panel/src/server.js|" "$UNIT"
  systemctl daemon-reload
else
  echo "  $UNIT topilmadi — qo'lda tekshiring"
fi

say "6/7 pm2 yozuvini yangilash (uzumpdfs)"
# DIQQAT: uzumPDFs `process.cwd()` dan uploads/, public/ va history.json ni
# topadi — shuning uchun --cwd majburiy, aks holda fayllar boshqa joyda
# qidiriladi va dashboard bo'sh chiqadi.
pm2 delete uzumpdfs || true
pm2 start "$STOCKER/pdfs/main.js" --name uzumpdfs --cwd "$STOCKER/pdfs"
pm2 save

say "7/7 Ishga tushirish va tekshirish"
systemctl start fikrlovchi-panel
sleep 3

fail=0
check() {
  local name="$1" url="$2" want="$3"
  local code
  # `|| echo 000` YOZILMAYDI: curl xato bo'lsa ham '000' chop etadi va ikki
  # marta chiqib '000000' bo'lib ketardi.
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)
  [ -n "$code" ] || code=000
  if [ "$code" = "$want" ]; then
    printf '  ✅ %-28s %s\n' "$name" "$code"
  else
    printf '  ❌ %-28s %s (kutilgan %s)\n' "$name" "$code" "$want"
    fail=1
  fi
}
check "panel /login"        http://127.0.0.1:3000/login        200
check "uzumPDFs dashboard"  http://127.0.0.1:4040/             200
check "stocker /health"     http://127.0.0.1:4044/health       200

if [ "$fail" != 0 ]; then
  cat <<'EOS'

Tekshiruv o'tmadi. Loglar:
  journalctl -u fikrlovchi-panel -n 40 --no-pager
  pm2 logs uzumpdfs --lines 40 --nostream

QAYTARISH (eski holatga):
  systemctl stop fikrlovchi-panel; pm2 delete uzumpdfs
  cp /etc/systemd/system/fikrlovchi-panel.service.bak-* /etc/systemd/system/fikrlovchi-panel.service
  systemctl daemon-reload && systemctl start fikrlovchi-panel
  cd /root/uzumpdfs && pm2 start main.js --name uzumpdfs --cwd /root/uzumpdfs && pm2 save
EOS
  exit 1
fi

say "Eski papkalarni zaxiraga olish"
[ -d "$OLD_PANEL" ] && mv "$OLD_PANEL" "$OLD_PANEL.bak-$STAMP"
[ -d "$OLD_PDFS" ] && mv "$OLD_PDFS" "$OLD_PDFS.bak-$STAMP"

cat <<EOS

Tayyor. Endi hamma kod bitta joyda: $STOCKER

  $STOCKER/server   yig'ish serveri (systemd stocker-server, 4044)
  $STOCKER/panel    admin panel     (systemd fikrlovchi-panel, 3000)
  $STOCKER/pdfs     yorliqlar       (pm2 uzumpdfs, 4040)
  $STOCKER/android  $STOCKER/desktop  $STOCKER/brand  $STOCKER/deploy

Bundan keyin yangilanish BITTA buyruq:
  cd $STOCKER && git pull && sudo systemctl restart stocker-server fikrlovchi-panel && pm2 restart uzumpdfs

Eski papkalar zaxirada: $OLD_PANEL.bak-$STAMP · $OLD_PDFS.bak-$STAMP
Bir hafta ishlagach o'chirsangiz bo'ladi.
EOS
