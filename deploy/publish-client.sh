#!/usr/bin/env bash
# React SPA'ni yig'ib, nginx o'qiy oladigan joyga chiqaradi.
#
#   /root/stocker/client  →  npm run build  →  /var/www/stocker/app
#
# Nega ko'chiriladi: `/root` papkasi 0700 bilan yopiq, nginx (www-data)
# undan fayl o'qiy olmaydi va 403 qaytaradi. `/root` ga ruxsat ochish
# o'rniga natijani /var/www ga qo'yamiz — o'sha yerda landing ham turibdi.
#
# Ishlatilishi:
#   bash /root/stocker/deploy/publish-client.sh
set -euo pipefail

SRC=/root/stocker/client
DEST=/var/www/stocker/app

echo "▸ Yig'ish"
cd "$SRC"
npm install --no-audit --no-fund
npm run build

echo "▸ Chiqarish: $DEST"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST.new"
cp -a "$SRC/dist" "$DEST.new"
# Eski nusxa oxirgi lahzada almashtiriladi: yig'ish paytida sayt ochiq qoladi.
rm -rf "$DEST.old"
[ -d "$DEST" ] && mv "$DEST" "$DEST.old"
mv "$DEST.new" "$DEST"
rm -rf "$DEST.old"

# nginx faqat o'qishi kerak; papkalarga kirish uchun +x.
chmod -R a+rX /var/www/stocker

echo "▸ Tekshiruv"
code=$(curl -s -o /dev/null -w '%{http_code}' https://stocker.uz/app/ || true)
echo "   https://stocker.uz/app/ → ${code:-000}"
[ "$code" = "200" ] || echo "   ⚠️  200 emas: nginx konfigi yangilanganini tekshiring (deploy/nginx-stocker.uz.conf)"
