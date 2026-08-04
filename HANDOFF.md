# Stocker v4 — topshirish hujjati

Yangi sessiyada ishni davom ettirish uchun. Loyihaning **dizayni**
[PLAN.md](PLAN.md) da, bu yerda **holat, topilgan tuzoqlar va ochiq savollar**.

Oxirgi commit'lar: `stocker_v4@142dfd6` · `uzumpdfs@1ba725f`

---

## 1. Fazalar holati

| Faza | Holat | Izoh |
|---|---|---|
| 1 · Server yadrosi (kesh, filtr, SQLite) | ✅ | `server/`, 100 ta test |
| 2 · MoySklad barcode indeksi | ✅ | 7 kunlik kesh, sahifalab o'qish |
| 3 · uzumPDFs 40×30 ShK + internal API | ✅ | maket tasdiqlandi, QR 15 mm |
| 4 · Skan mantiqi (sessiya, lock, avto-tanlash) | ✅ | qisman UNIQUE indeks bilan lock |
| 5 · Print quvuri (WS, navbat, ACK, retry) | ✅ | idempotent, PDF proxy orqali |
| 6 · Electron desktop client | ✅ | + qog'oz yo'nalishi sozlamasi |
| 7 · Android native (Kotlin + Compose) | ✅ | **v0.2.0**, APK yig'ilgan, skan→print ishladi |
| **8 · Panel: operator login + ish joylari** | ⏳ | **keyingi ish** |
| 9 · MoySklad "Собран" + `uzum_packing` + Telegram | ⏳ | |
| 10 · Deploy yakuni (TLS, backlog tozalash) | ⏳ | qisman bajarilgan |

---

## 2. Serverda tasdiqlangan natijalar

| | |
|---|---|
| Yig'ishga tayyor buyurtmalar | **434** / 459 keshda |
| MoySklad tovarlari | **4777**, barcode **9569**, topilmagan **0** |
| Barcode indeksi | 3036 (2569 moysklad + 467 uzum) |
| Har tovarda MoySklad barcode'i | **467 / 467** |
| Noaniq barcode (bir kod → 2 tovar) | **0** |
| `problems` (bad_quantity / unscannable) | **0** |
| To'liq zanjir: skan → job → PDF | ✅ HTTP 200, 17784 bayt |

---

## 3. Ochiq savollar — birinchi navbatda hal qilinadi

1. **Android v0.2.0 sinovi.** Chiroq va rejim tugmalari endi ko'rinadimi?
   Oldingi skrinshot v0.1.0 dan edi (nishon ramkasi 220×150dp — rejim
   funksiyasidan oldingi o'lchov). Skan ekranida `v0.2.0` yozuvi bo'lishi
   kerak — bo'lmasa o'rnatish o'tmagan.

2. **HTTPS tasdiqlanmadi.**
   ```bash
   curl -sI https://uzum.fikrlovchi.uz/ | head -3
   curl -s https://uzum.fikrlovchi.uz/pack/health
   ```
   nginx konfigi qo'yilgan va certbot ishlatilgan, lekin natija tekshirilmadi.
   Ishlagach `PUBLIC_BASE_URL` ni ikkala `.env` ga qaytarish kerak
   (uzumpdfs'dan `sed -i` bilan olib tashlangan edi).

3. **Dashboard paroli.** `uzumPDFs` ga `dotenv` qo'shilgandan keyin
   `DASHBOARD_PASSWORD` holati aniqlanmadi. Tekshirish:
   ```bash
   pm2 logs uzumpdfs --lines 40 --nostream | grep -i -E "DASHBOARD|changeme"
   ```

4. **BIG printer.** Gainsha GS-2408 ulanganmi? Oldingi sinov `GP-5830 Series`
   da bo'lgan — u 58 mm chek printeri, 101.6 mm yorliq unga jismonan sig'maydi.

5. **Ishga tushirish kunidagi backlog.** 434 buyurtma "yig'ishga tayyor" deb
   turadi, lekin ko'pchiligi allaqachon jo'natilgan. Yechim: `uzum_packing`
   ga o'sha paytdagi barcha ochiq buyurtmalarni `done` bilan bir marta yozib
   qo'yish. 10-fazada.

---

## 4. Qayta o'rganmaslik kerak bo'lgan tuzoqlar

Bularning har biri **bir marta vaqt yo'qotgan** — kodda va README'larda ham
izohlangan.

### Ma'lumot va API

1. **`uzum_order!V` "bekor qilingan" degani EMAS.** `cancelSync.js:148`
   buyurtma tushganidan 24 soat o'tgach, bekor qilinmagan bo'lsa ham `V=1`
   qo'yadi. Filtr sifatida ishlatilmaydi — bekor qilinganlik faqat MoySklad
   holatidan aniqlanadi.

2. **"Собран" = eski `protectedHref`**, `uzumOrderToMC` da endi ishlatilmaydi
   (`HANDOFF.md:93`). To'qnashuv yo'q, uzumOrderToMC'ga kod o'zgarishi
   kerak emas.

3. **MoySklad `assortment?filter=id=<href>` ishlamaydi** — xato 1014.
   Sahifalab o'qish (`?limit=1000&offset=N`) ishonchli.

4. **Faqat `Q=1 · T=1 · U="done"`** buyurtma yig'ishga chiqadi. `U="done"`
   sharti hold oynasidagilarni ham, ishlanmaganlarni ham chiqarib tashlaydi.

### Kod va kutubxonalar

5. **better-sqlite3** SQL'da mavjud bo'lmagan nomlangan parametrni qabul
   qilmaydi. Shartli `WHERE` bilan params obyekti birga qurilishi kerak.

6. **pdf-lib aylantirilgan matn** baseline atrofida buriladi: 90° da glif
   balandligi −X tomonga cho'ziladi. Ustunning chap chekkasi X bo'lishi uchun
   baseline `X + ascent` ga qo'yiladi. (Hozirgi ShK maketi gorizontal,
   lekin bilib turish kerak.)

7. **Android `PreviewView`** standart `SurfaceView` ishlatadi — Compose'ning
   kesishini va qatlam tartibini hisobga olmaydi. `ImplementationMode.COMPATIBLE`
   (TextureView) shart.

8. **`pdf-to-printer`** faqat `portrait`/`landscape` va
   `noscale`/`shrink`/`fit` ni qabul qiladi. Bo'sh qiymat uzatilmasligi kerak.

### Muhit va deploy

9. **Port 4043 band** (`analytics`), stocker **4044** da. To'liq jadval
   `server/README.md` da.

10. **Serverda ikki xil boshqaruv aralash:**
    `pm2` — uzumpdfs, mc-webhook, mc-cancel
    `systemd` — fikrlovchi-panel, analytics, stocker-server
    `systemctl restart uzumpdfs` ishlamaydi.

11. **nginx `uzum.fikrlovchi.uz` konfigini ustidan nusxalamang** — certbot
    qo'shgan 443 bloki yo'qoladi va sayt "Not secure" bo'lib qoladi. Tiklash:
    `sudo certbot --nginx -d uzum.fikrlovchi.uz --redirect` → `1`.

12. **uzumPDFs'da `dotenv` yo'q edi** — qo'shildi. Ilgari `.env` umuman
    o'qilmasdi.

13. **Android Studio ichida JDK 25 keladi**, Gradle 8.11 esa 23 gacha
    qo'llaydi → Gradle JDK ni **21** qilib qo'yish shart.

14. **Studio va buyruq satridagi Gradle bir vaqtda ishlamaydi** — qulfni
    talashadi. CLI build'dan oldin Studio'ni yopish kerak.

---

## 5. Buyruqlar

### Server (stocker)

```bash
cd /root/stocker && git pull && sudo systemctl restart stocker-server
```

```bash
cd /root/stocker/server && node src/scripts/refreshOnce.js     # keshni bir marta
cd /root/stocker/server && node src/scripts/syncBarcodes.js    # to'liq assortiment
```

Diagnostika (`TOKEN` = `.env` dagi `SERVICE_TOKEN`):

```bash
TOKEN=$(grep -m1 '^SERVICE_TOKEN=' /root/stocker/server/.env | cut -d= -f2); S() { curl -s -H "X-Service-Token: $TOKEN" -H "Content-Type: application/json" "$@"; }
```

| Endpoint | Vazifa |
|---|---|
| `S http://127.0.0.1:4044/debug/stats` | kesh statistikasi |
| `S "http://127.0.0.1:4044/debug/samples?limit=5"` | sinov uchun haqiqiy barcode |
| `S http://127.0.0.1:4044/debug/order/<id>` | nega yig'ishga chiqmayapti |
| `S "http://127.0.0.1:4044/debug/orders?minUnits=2"` | ko'p skanli buyurtmalar |
| `S http://127.0.0.1:4044/print/queue` | chop etish navbati |
| `S http://127.0.0.1:4044/print/stations` | ish joylari, onlayn holati |

### uzumPDFs

```bash
cd /root/uzumpdfs && git pull && pm2 restart uzumpdfs
```

```bash
cd /root/uzumpdfs && node scripts/shkSample.js --debug    # namuna yorliq
cd /root/uzumpdfs && node scripts/shkForOrder.js <orderId>  # haqiqiy yorliq
```

### Android (lokal, Windows)

`cmd.exe` da chain `&&` bilan (PowerShell'dagi `;` emas). Studio yopiq bo'lsin.

```bash
cd C:\Users\User\Desktop\Buyo\Server\Stocker\stocker_v4\android && gradlew.bat assembleRelease
```

APK: `app\build\outputs\apk\release\app-release.apk`.
Yuborishdan oldin versiya bilan nomlash tavsiya etiladi (`stocker-0.2.0.apk`) —
eski yuklab olingan fayl bilan chalkashmasin.

### Desktop client

```bash
cd C:\Users\User\Desktop\Buyo\Server\Stocker\stocker_v4\desktop && npm start
```

O'rnatgich: `npm run build` (Developer Mode yoqilgan bo'lishi kerak, aks holda
`winCodeSign` symlink xatosi).

### Testlar

```bash
cd C:\Users\User\Desktop\Buyo\Server\Stocker\stocker_v4\server && node src/scripts/selfTest.js
```

100 ta tekshiruv, Google/MoySklad'siz, vaqtinchalik bazada.

---

## 6. Keyingi ish — 8-faza

Panel'ga (`C:\Users\User\Desktop\Buyo\Server\fikrlovchi_project_panel`) qo'shish:

1. **Migratsiya `007_project_users.sql`** — loyihaga bog'langan umumiy
   foydalanuvchilar jadvali. Panel'da hozir faqat bitta admin bor
   (`ADMIN_PASSWORD_HASH`), foydalanuvchilar jadvali yo'q.
2. **"Operatorlar" kartasi** — qo'shish / nom o'zgartirish / parol tiklash /
   faolsizlantirish. `bcryptjs` allaqachon bog'liqlikda.
3. **Migratsiya `008_stocker_stations.sql`** + **"Ish joylari" kartasi** —
   bir martalik enrollment kod, printerlar, onlayn holat, tokenni bekor qilish.
4. **API** `GET /api/project-users` — stocker 60 s da tortib o'z SQLite'iga
   keshlaydi va login'ni **mahalliy** tekshiradi (panel o'chsa ham operatorlar
   ishlayveradi).
5. **Panel daemon boshqaruvi** — `projectControl.js` systemd **timer**ga
   mo'ljallangan, stocker esa doimiy daemon. `timerUnit` bo'lmaganda faqat
   start/stop/restart ko'rsatadigan qilib kichik tuzatish kerak.

Batafsil: [PLAN.md](PLAN.md) 6.4 va 6.5 bo'limlari.

Ishni boshlashdan oldin sizdan kerak: **dastlabki 2 operatorning login
nomlari va to'liq ismlari**.
