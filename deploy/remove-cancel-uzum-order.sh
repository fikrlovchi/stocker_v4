#!/usr/bin/env bash
# "Uzum CANCELED → MoySklad" (cancel-uzum-order) loyihasini olib tashlaydi.
# Loyiha faol emas — 2026-08-06 da to'xtatishga qaror qilindi.
#
#   bash /root/stocker/deploy/remove-cancel-uzum-order.sh
#
# Nima qiladi:
#   1. systemd timer va service — to'xtatadi, avtoyuklashdan chiqaradi
#   2. unit fayllarini zaxiraga olib o'chiradi
#   3. papkani `.removed-<sana>` qilib nomlaydi (O'CHIRMAYDI)
#   4. bazadagi yozuvlarini (runs, loglar, env bog'lamalari) o'chiradi
#
# Papka va unit zaxiralari qoladi: fikr o'zgarsa qaytarish mumkin.
set -euo pipefail

SLUG=cancel-uzum-order
DIR=/root/cancelUzumOrder
UNITS=(cancel-uzum-order.timer cancel-uzum-order.service)
UNIT_DIR=/etc/systemd/system
DB=/root/stocker/data/stocker.db
STAMP=$(date +%Y%m%d-%H%M)

say() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }

say "1/4 To'xtatish va avtoyuklashdan chiqarish"
for u in "${UNITS[@]}"; do
  systemctl stop "$u" 2>/dev/null || true
  systemctl disable "$u" 2>/dev/null || true
  echo "  $u"
done

say "2/4 Unit fayllarini olib qo'yish"
mkdir -p "/root/removed-units-$STAMP"
for u in "${UNITS[@]}"; do
  if [ -f "$UNIT_DIR/$u" ]; then
    mv "$UNIT_DIR/$u" "/root/removed-units-$STAMP/$u"
    echo "  $u → /root/removed-units-$STAMP/"
  fi
done
systemctl daemon-reload
systemctl reset-failed 2>/dev/null || true

say "3/4 Papkani nomlash (o'chirilmaydi)"
if [ -d "$DIR" ]; then
  mv "$DIR" "$DIR.removed-$STAMP"
  echo "  $DIR.removed-$STAMP"
else
  echo "  $DIR topilmadi"
fi

say "4/4 Bazadagi yozuvlar"
if [ -f "$DB" ]; then
  # Avval nusxa: loglar bilan birga o'chadi, qaytarib bo'lmaydi.
  cp -a "$DB" "$DB.bak-$STAMP"
  node -e "
    const D = require('/root/stocker/server/node_modules/better-sqlite3');
    const db = new D('$DB');
    const p = db.prepare('SELECT id, display_name FROM projects WHERE slug = ?').get('$SLUG');
    if (!p) { console.log('  bazada yo\'q'); process.exit(0); }
    const runs = db.prepare('SELECT COUNT(*) n FROM runs WHERE project_id = ?').get(p.id).n;
    const logs = db.prepare('SELECT COUNT(*) n FROM log_events WHERE project_id = ?').get(p.id).n;
    db.prepare('DELETE FROM log_events WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM runs WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM project_env_bindings WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM project_sheet_links WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM project_telegram_links WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
    console.log(\`  \${p.display_name}: \${runs} run, \${logs} log yozuvi o'chirildi\`);
  "
  echo "  baza nusxasi: $DB.bak-$STAMP"
else
  echo "  $DB topilmadi — o'tkazib yuborildi"
fi

cat <<EOS

Tayyor. "Uzum CANCELED → MoySklad" tizimdan chiqarildi.

Qoldirilganlar (fikr o'zgarsa):
  $DIR.removed-$STAMP
  /root/removed-units-$STAMP/
  $DB.bak-$STAMP

GitHub repo'sini o'chirmang — ARXIVLANG (Settings → Archive this repository):
tarix saqlanadi va tasodifan qayta ishlatilmaydi.
EOS
