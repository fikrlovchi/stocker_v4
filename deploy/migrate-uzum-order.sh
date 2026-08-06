#!/usr/bin/env bash
# uzumOrderToMC ni monorepo ostiga ko'chiradi:
#
#   /root/uzumOrderToMC  →  /root/stocker/uzum-order-to-mc
#
# Kod GitHub'dan keladi (subtree bilan ko'chirilgan), bu skript esa kodga
# kirmaydigan narsalarni ko'chiradi (.env, credentials, data/, logs/) va
# systemd unit yo'llarini yangilaydi.
#
#   bash /root/stocker/deploy/migrate-uzum-order.sh
#
# To'xtash oynasi: 1-2 daqiqa. Loyiha timer bilan ishlagani uchun eng yomoni
# bitta tsikl kechikadi.
set -euo pipefail

NEW=/root/stocker/uzum-order-to-mc
OLD=/root/uzumOrderToMC
SERVICE=uzum-order.service
TIMER=uzum-order.timer
UNIT_DIR=/etc/systemd/system
STAMP=$(date +%Y%m%d-%H%M)

say() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

[ -d "$NEW" ] || die "$NEW yo'q — avval: cd /root/stocker && git pull"
[ -d "$OLD" ] || die "$OLD topilmadi"

say "1/5 Timer'ni to'xtatish"
systemctl stop "$TIMER" || true
# Ishlab turgan tsikl tugashini kutamiz — yarmida uzilmasin.
while systemctl is-active --quiet "$SERVICE"; do
  echo "  ...joriy tsikl tugashi kutilmoqda"
  sleep 3
done

say "2/5 Ma'lumotlarni ko'chirish"
for f in .env credentials.json oauth.json config.local.json; do
  [ -f "$OLD/$f" ] && cp -a "$OLD/$f" "$NEW/$f" && echo "  $f"
done
for d in data logs labels Uzum; do
  if [ -d "$OLD/$d" ]; then
    mkdir -p "$NEW/$d"
    cp -a "$OLD/$d/." "$NEW/$d/" 2>/dev/null || true
    echo "  $d/"
  fi
done

say "3/5 Bog'liqliklar"
(cd "$NEW" && npm ci --omit=dev 2>/dev/null || npm install --omit=dev)

say "4/5 systemd unit'lari"
for unit in "$SERVICE" "$TIMER"; do
  f="$UNIT_DIR/$unit"
  [ -f "$f" ] || continue
  cp -a "$f" "$f.bak-$STAMP"
  # Eski yo'l qayerda uchrasa — yangisiga.
  sed -i "s|$OLD|$NEW|g" "$f"
  echo "  $unit"
done
systemctl daemon-reload

say "5/5 Ishga tushirish va tekshirish"
systemctl start "$TIMER"
systemctl start "$SERVICE"
sleep 5

if systemctl is-failed --quiet "$SERVICE"; then
  cat <<EOS

✖ Servis xato bilan tugadi. Log:
  journalctl -u $SERVICE -n 40 --no-pager

QAYTARISH:
  systemctl stop $TIMER
  cp $UNIT_DIR/$SERVICE.bak-$STAMP $UNIT_DIR/$SERVICE
  cp $UNIT_DIR/$TIMER.bak-$STAMP $UNIT_DIR/$TIMER
  systemctl daemon-reload && systemctl start $TIMER
EOS
  exit 1
fi

echo "  ✅ $SERVICE: $(systemctl is-active $SERVICE) · $TIMER: $(systemctl is-active $TIMER)"

say "Eski papkani zaxiraga olish"
mv "$OLD" "$OLD.bak-$STAMP"

cat <<EOS

Tayyor. Endi uzumOrderToMC ham monorepoda: $NEW
Eski papka zaxirada: $OLD.bak-$STAMP (bir hafta ishlagach o'chirsangiz bo'ladi)

Panelda ko'rsatiladigan yo'l ham yangilandi (server/src/web/projects.js dagi
envPath) — "Uzum order to MC" bo'limidagi muhit sozlamalari shu faylga
yoziladi: $NEW/.env
EOS
