# Stocker v4 — topshirish hujjati

Yangi sessiyada ishni davom ettirish uchun. Loyihaning **dizayni**
[PLAN.md](PLAN.md) da, bu yerda **holat, topilgan tuzoqlar va ochiq savollar**.

Oxirgi commit'lar: `stocker_v4@bd37b6a` · `uzumpdfs@1ba725f` ·
`fikrlovchi_project_panel@0bae7ea` — ikkalasi ham **push qilinmagan**

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
| 7 · Android native (Kotlin + Compose) | ✅ | **v0.3.0**, tugmalar va chiroq sinovdan o'tdi |
| 8a · Operator login (PLAN 6.4) | ✅ | panel karta + stocker kesh/login + Android kirish ekrani, **deploy qilinmagan** |
| **8b · Ish joylari kartasi (PLAN 6.5)** | ⏳ | **keyingi ish** — enrollment kod, station tokeni |
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

1. **Operator login'ini deploy qilish va sinash** (kod tayyor, serverga
   chiqarilmagan). Ketma-ketlik 6-bo'limda.

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

## 6. Keyingi ish

### 6.1 Operator login'ini deploy qilish (kod tayyor)

Panel (`fikrlovchi_project_panel`) va stocker ikkalasi ham yangilanadi.
Panel'da stocker loyihasi **hali ro'yxatdan o'tmagan** (`projects` da faqat
`test-proj` va `uzum-order-to-mc` bor) — birinchi qadam shu.

1. Panel'ni yangilash va restart:
   ```bash
   cd /root/fikrlovchi-panel && git pull && npm i && sudo systemctl restart fikrlovchi-panel
   ```
   `007_project_users.sql` boot'da o'zi qo'llanadi.

2. Stocker loyihasini panel'ga qo'shish va API kalitini olish:
   ```bash
   cd /root/fikrlovchi-panel && node scripts/seed-project.js stocker "Stocker — yig'ish" stocker-server.service
   ```
   Chiqqan API kalitni stocker `.env` ga yozish:
   `PANEL_PROJECT_SLUG=stocker`, `PANEL_API_KEY=...`,
   `PANEL_INGEST_URL=https://<panel>/api/ingest/runs`.

3. Panel'da loyiha sahifasi → **Operatorlar** kartasidan ikkita hisob:
   loginlari `operator1` va `operator2`, parollari kartada qo'lda kiritiladi
   (git'ga yozilmaydi). To'liq ismlar keyin tahrirlanadi — karta nomni
   o'zgartirishga ruxsat beradi.

4. Stocker'ni yangilash:
   ```bash
   cd /root/stocker && git pull && cd server && npm i && sudo systemctl restart stocker-server
   ```
   `npm i` majburiy — yangi bog'liqlik `bcryptjs`.

5. Tekshirish:
   ```bash
   S http://127.0.0.1:4044/debug/operators     # ikkita faol operator ko'rinishi kerak
   curl -s -X POST http://127.0.0.1:4044/api/auth/login -H "Content-Type: application/json" -d '{"login":"operator1","password":"<parol>"}'
   ```
   Ikkinchi buyruq `{"token":"...","displayName":"..."}` qaytarishi kerak.

6. Telefonga **v0.3.0** APK (`android/app/build/outputs/apk/release/stocker-0.3.0.apk`)
   — kirish ekranida server manzili, `operator1` va uning paroli.

### 6.2 Ish joylari kartasi — PLAN 6.5

1. **Migratsiya `008_stocker_stations.sql`** + **"Ish joylari" kartasi** —
   bir martalik enrollment kod, printerlar, onlayn holat, tokenni bekor qilish.
2. Stocker: station tokeni bilan WS ulanish (hozir umumiy `SERVICE_TOKEN`),
   `POST /api/station/enroll` bir martalik kod bo'yicha.
3. Electron client: birinchi ochilganda kod so'raladi, token saqlanadi.
4. **Panel daemon boshqaruvi** — `projectControl.js` systemd **timer**ga
   mo'ljallangan, stocker esa doimiy daemon. `timerUnit` bo'lmaganda faqat
   start/stop/restart ko'rsatadigan qilib kichik tuzatish kerak (stocker'ni
   `manageable-units.js` ga qo'shishdan oldin).

Batafsil: [PLAN.md](PLAN.md) 6.5 bo'limi.
