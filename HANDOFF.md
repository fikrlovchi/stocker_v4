# Stocker — topshirish hujjati

Yangi sessiyada ishni davom ettirish uchun. **Avval o'qing:**
[docs/CONSOLIDATION.md](docs/CONSOLIDATION.md) — yagona tizimga birlashtirish
rejasi va nima bajarilgani, so'ng
[docs/V3-MIGRATION.md](docs/V3-MIGRATION.md) — AppSheet v3 bazasini (Google
Sheets) serverga ko'chirish rejasi, **hozirgi asosiy ish**. Loyihaning
dastlabki dizayni [PLAN.md](PLAN.md) da.

Oxirgi holat: 2026-08-07. Barcha kod **bitta repo**da (`stocker_v4`),
serverda `/root/stocker`, domen **stocker.uz**.

---

## 0. Bugungi tuzilish

```
stocker_v4/
├─ server/            stocker-server (systemd, 4044) — yig'ish API, /web/* SPA API
├─ client/            React SPA — stocker.uz ning O'ZI (nginx /var/www/stocker/app dan beradi)
├─ panel/             ESKI EJS panel (systemd, 3000) — tashqariga chiqarilmagan, o'chirishga tayyor
├─ pdfs/              uzumPDFs (pm2, 4040) — yorliq PDF'lari
├─ uzum-order-to-mc/  buyurtma tortish (systemd timer)
├─ android/ desktop/  operator ilovasi (v0.6.3) va print client (v0.4.0)
├─ brand/ deploy/ docs/ web/
└─ data/stocker.db    YAGONA baza (panel + yig'ish jadvallar bir joyda)
```

Yangilash — bitta buyruq:

```bash
cd /root/stocker && git pull && cd server && npm i && sudo systemctl restart stocker-server && cd .. && bash deploy/publish-client.sh && pm2 restart uzumpdfs
```

## 1. Bo'limlar holati

| Bo'lim | Holat | Izoh |
|---|---|---|
| Kirish, foydalanuvchilar va ruxsatlar | ✅ | `users` + bo'lim ruxsatlari + `mobile` bayrog'i |
| Yig'ish (partiyalar) | ✅ | ID ro'yxati, do'kon bo'yicha 2/22, skan doirasi |
| Yorliqlar | ✅ | SPA ichida; Yangi (40×30) / Eski format; umumiy standart o'lchamlar |
| Integratsiyalar (ex "Uzum order to MC") | ✅ | systemd loyihalari + **Qoldiq oqimlari** (holat, jadval, tarix) |
| Tovar bog'lamalari (`link_product`) | ✅ | qo'shish formasi (AppSheet kabi), hisoblangan qoldiq, tahrirlash |
| Barcode va SKU jurnali | ✅ | Integratsiyalar ichida — qator qo'shilganda bajarilgan amallar natijasi |
| Konfiguratsiya | ✅ | Uzum · MoySklad token · Telegram · Google Sheets · Qoldiq modifikatsiyasi (bo'sh) |
| Uzum buyurtmalari | ⏳ | karkas bor, ma'lumot 5-bosqichda ([docs/V3-MIGRATION.md](docs/V3-MIGRATION.md)) |
| Mobil ilova | ✅ | v0.6.3 — do'kon guruhi sarlavhada, ShK+PRINT yonma-yon, tarix mahalliy vaqtda |
| Desktop client | ✅ | v0.4.0 — navbatni tozalash, uz/ru |
| **`panel/` ni o'chirish** | ⏳ | **keyingi ish** — hamma bo'lim ko'chdi, sinovdan keyin o'chiriladi |
| 4-bosqich: bitta API jarayoni | ⏳ | panel + pdfs marshrutlari `server/` ga |
| Ish joyi tokeni (PLAN 6.5) | ⏳ | desktop client hali umumiy `SERVICE_TOKEN` bilan ulanadi |
| 9-faza: MoySklad "Собран" + Telegram | ⏳ | |

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

## 3. Ochiq savollar / keyingi ish

1. **`panel/` ni o'chirish.** Barcha bo'lim SPA'ga ko'chdi (loyihalar,
   yorliqlar, foydalanuvchilar, o'zgaruvchilar katalogi). Qolgani —
   `stocker.uz` da hammasini bir bor sinab ko'rish, so'ng:
   `systemctl disable --now fikrlovchi-panel`, repodan `panel/` ni olib
   tashlash, nginx'dagi `/pdf/` uchun `auth_request` blokini olib tashlash
   (u panel sessiyasiga tayanadi).

2. **Ish joyi tokeni (PLAN 6.5).** Desktop client hali umumiy
   `SERVICE_TOKEN` bilan ulanadi — `/pack/` internetdan ochiq bo'lgani uchun
   bu eng jiddiy ochiq nuqta.

3. **4-bosqich:** `panel/` va `pdfs/` marshrutlarini `server/` ichiga
   ko'chirib, uchta Node jarayonini bittaga yig'ish. Oxirida qilinadi —
   yorliq quvuri shu servislarga bog'liq.

4. **BIG printer.** Gainsha GS-2408 ulanganmi? Oldingi sinov `GP-5830 Series`
   da bo'lgan — u 58 mm chek printeri, 101.6 mm yorliq unga sig'maydi.

5. **Ishga tushirish kunidagi backlog.** ~500 buyurtma "yig'ishga tayyor"
   turadi, ko'pchiligi allaqachon jo'natilgan. Yechim: `uzum_packing` ga
   o'sha paytdagi ochiq buyurtmalarni `done` bilan bir marta yozib qo'yish.

6. **Yangi (40×30) format serverda sinalmagan** — lokalda Google Sheets
   kirishi yo'q. `stocker.uz` → Yorliqlar → Yangi → bir nechta ID bilan
   tekshirish kerak.

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

### Konsolidatsiyada topilganlar

15. **SPA'ni `/root/...` dan bermang** — `/root` 0700 bilan yopiq, nginx
    (www-data) o'qiy olmaydi va 403 beradi. `deploy/publish-client.sh`
    natijani `/var/www/stocker/app` ga chiqaradi.

16. **`location /app/` `/app` ga mos kelmaydi** (oxirida slash yo'q) — so'rov
    boshqa blokka tushadi. Redirect qo'shilgan.

17. **uzumPDFs `process.cwd()` ga bog'liq** (`uploads/`, `public/`,
    `history.json`) — pm2 `--cwd` bilan ishga tushirilishi shart.

18. **Ikkala bazada `schema_migrations` bor edi**, ustunlari har xil
    (`name` ↔ `filename`). Birlashtirishda panel'niki
    `panel_schema_migrations` ga ko'chdi.

19. **SPA `/pdf/` ga to'g'ridan-to'g'ri bora olmaydi**: u Bearer token bilan,
    `/pdf/` esa panel cookie'si bilan ishlaydi. Yo'l `/web/labels/*` proxy
    orqali (`server/src/web/labels.js`).

20. **PDF'ni `<iframe src>` bilan ko'rsatib bo'lmaydi** — sarlavha
    yuborilmaydi. SPA faylni `fetch` bilan olib blob URL yasaydi.

20a. **ShK soni `uzum_order_detail!K` dan olinadi, `F` dan EMAS.**
    `K` ("Quantity for mc") = Uzum miqdori × kartochkadagi miqdor
    (`link_product!N`). Yangi (40×30) formatda bu ko'paytiruv tushib qolgan
    edi va har qator uchun faqat `copies` ta yorliq chiqardi: kartochkada
    3 ta tovar bo'lsa 6 emas, 2 ta. Hisob endi
    `pdfs/functions/labelCount.js` da va selfTest bilan qoplangan.
    Skan oqimi to'g'ri edi — u har birlikni alohida skanerlaydi va miqdorni
    `config.json` dagi `details.quantity = "K"` dan oladi.

21. **Panel jadvallarining ustun nomlarini taxmin qilmang.** `google_sheets`
    da `url` ustuni **yo'q** (`panel/src/db/migrations/003_variables.sql`),
    lekin `server/src/web/variables.js` uni so'ragan edi → har so'rov
    `no such column: url` bilan yiqilib, O'zgaruvchilar bo'limi "Yuklanmoqda..."
    da qotib qolgan. Jadvallar server migratsiyalarida emas, panel'nikida
    yaratilgan — SQL yozishdan oldin o'sha fayllarga qarang. selfTest endi
    panel sxemasini qo'llab, routerni HTTP orqali sinaydi (13-bo'lim).

22. **SPA'da `if (!data) return <Yuklanmoqda/>` — yashirin tuzoq.** So'rov
    xato bersa `data` hech qachon to'lmaydi va xato ekranga chiqmaydi:
    foydalanuvchi abadiy "Yuklanmoqda..." ni ko'radi. Sarlavha va xato
    kartasi har doim chizilishi kerak (`Projects.jsx` dagidek). Server
    tomonda ham global JSON xato ishlovchisi bor (`index.js`) — standart
    Express HTML qaytarardi, SPA uni o'qiy olmasdi.

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

v3 jadvalining tuzilmasini chiqarish (`docs/v3-sheet-structure.json` ga
yoziladi, tokenlar niqoblanadi):

```bash
cd /root/stocker/server && node src/scripts/dumpSheet.js
```

v3 bazasini serverga ko'chirish va natijani jadval bilan solishtirish
(hech narsa yozilmaydi — na Uzumga, na jadvalga):

```bash
cd /root/stocker/server && node src/scripts/v3Sync.js
```

MoySklad qoldiq hisobotining barqarorligini o'lchash (faqat o'qiydi):

```bash
cd /root/stocker/server && node src/scripts/stockProbe.js
```

Qoldiq sinxronizatsiyalari tarixi va xulosa:

```bash
cd /root/stocker/server && node src/scripts/stockLog.js
```

**Yozuv oqimlari (4-bosqich).** Ikkalasi ham standart holatda hech narsa
yozmaydi — bayroqsiz ishga tushirsa faqat nima bo'lishini ko'rsatadi:

```bash
cd /root/stocker/server && node src/scripts/pushStock.js
```

```bash
cd /root/stocker/server && node src/scripts/barcodeSync.js
```

Yuborish/yozish uchun `--send` va `--write`. To'liq tartib
[docs/V3-MIGRATION.md](docs/V3-MIGRATION.md) 4-bosqichida.

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
cd C:\Users\User\Desktop\Buyo\Server\Stocker\stocker_v4\android && set JAVA_HOME=C:\Program Files\Java\jdk-21.0.12&& gradlew.bat assembleRelease
```

`JAVA_HOME` ni qo'lda berish **shart**: Studio o'z JBR'ini ishlatadi, buyruq
satrida esa o'zgaruvchi bo'sh bo'lib build "JAVA_HOME is not set" bilan
tushadi. `set` dan keyin bo'shliq yo'q — aks holda yo'l oxiriga bo'shliq
qo'shilib ketadi. To'liq release build ~7 daqiqa.

APK: `app\build\outputs\apk\release\app-release.apk`.
Yuborishdan oldin versiya bilan nomlash tavsiya etiladi (`stocker-0.4.0.apk`) —
eski yuklab olingan fayl bilan chalkashmasin.

### Desktop client

```bash
cd C:\Users\User\Desktop\Buyo\Server\Stocker\stocker_v4\desktop && npm start
```

O'rnatgich: `npm run build` → `desktop/dist/Stocker Print Setup 0.1.0.exe`
(~86 MB, 2026-08-05 da yig'ilgan va tekshirilgan). Imzolanmagan, shuning uchun
Windows SmartScreen "More info → Run anyway" so'raydi. Developer Mode yoqilgan
bo'lishi kerak, aks holda `winCodeSign` symlink xatosi.

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

   Panel kodida `stocker` allaqachon `manageable-units.js` ga qo'shilgan
   (`stocker-server.service`, timer'siz daemon, `envPath=/root/stocker/server/.env`)
   — loyiha sahifasida "Boshqaruv" kartasi **"Qayta ishga tushirish"** va
   "To'xtatish/Davom ettirish" bilan, hamda "Muhit sozlamalari" kartasi
   ko'rinadi.

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

### 6.2 stocker.uz ga o'tish

Qaror: **bitta domen, yo'llar bo'yicha** — `stocker.uz` ildizida **admin
panel** (keyinchalik to'liq dastur), `stocker.uz/pack/` yig'ish API'si,
`stocker.uz/about` tanishtiruv sahifasi.

Panel ildizda turgani muhim: u havolalarni ildizdan yasaydi, shuning uchun
`/panel/` ostiga qo'yish uchun kerak bo'lgan `BASE_PATH` ishi **endi kerak
emas** — muammo o'z-o'zidan yopildi.

> **Bajarildi 2026-08-05 da.** Pastdagi qadamlar tarixi uchun qoldirildi —
> qayta o'rnatish yoki ikkinchi server ko'tarish kerak bo'lsa asqotadi. Konfig va landing repo'da tayyor:
[deploy/nginx-stocker.uz.conf](deploy/nginx-stocker.uz.conf),
[web/landing/index.html](web/landing/index.html).

1. **DNS** (registratorda): `stocker.uz` va `www.stocker.uz` uchun A yozuv →
   `64.226.69.129`. Tekshirish: `dig +short stocker.uz`
2. Landing'ni joylash:
   ```bash
   sudo mkdir -p /var/www/stocker && sudo cp /root/stocker/web/landing/index.html /var/www/stocker/
   ```
3. nginx:
   ```bash
   sudo cp /root/stocker/deploy/nginx-stocker.uz.conf /etc/nginx/sites-available/stocker.uz && sudo ln -sf /etc/nginx/sites-available/stocker.uz /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
   ```
4. TLS:
   ```bash
   sudo certbot --nginx -d stocker.uz -d www.stocker.uz --redirect
   ```
5. Ishlashini tasdiqlash: `curl -s https://stocker.uz/pack/health`
6. Ilovalardagi standart manzil allaqachon `https://stocker.uz/pack`
   (Android `Config.kt`, desktop va ikkala README). Eski o'rnatishlarda
   saqlangan manzil qoladi — kirish ekranidan qo'lda o'zgartiriladi.
7. APK'ni domen orqali tarqatish uchun:
   ```bash
   sudo cp /root/stocker/stocker-0.4.0.apk /var/www/stocker/stocker.apk
   ```
   (fayl repo'da emas — APK git'ga tushmaydi, uni qo'lda yuklaysiz)

Panel ikkala domenda ham ishlashda davom etadi (`fikrlovchi.uz` va
`stocker.uz`) — bitta jarayon, ikkita nginx server bloki. Sessiya cookie'si
domenga bog'liq, shuning uchun ikki domenda alohida kirish talab qilinadi.

### 6.3 uzumPDFs'ni stocker.uz/pdf/ ga ko'chirish (kod tayyor)

Qaror: **bitta ko'rinish + bitta login**, jarayonlar alohida qoladi — yorliq
quvuri (`/internal/shk-item`) tegilmagani uchun chop etish xavf ostida emas.
Kirish nginx `auth_request` orqali PANEL sessiyasidan tekshiriladi.

1. Uch repo'ni yangilash:
   ```bash
   cd /root/uzumpdfs && git pull && cd /root/fikrlovchi-panel && git pull && cd /root/stocker && git pull
   ```
2. `uzumpdfs/.env` ga uch qator (borini almashtiring, qo'shmang):
   ```bash
   cd /root/uzumpdfs && sed -i '/^PANEL_AUTH=/d;/^HOST=/d;/^PUBLIC_BASE_URL=/d' .env && printf 'PANEL_AUTH=1
HOST=127.0.0.1
PUBLIC_BASE_URL=https://stocker.uz/pdf
' >> .env && pm2 restart uzumpdfs
   ```
   `HOST=127.0.0.1` **majburiy**: `PANEL_AUTH=1` bilan servis o'z parolini
   so'ramaydi, shuning uchun 4040-port tashqariga chiqmasligi kerak. Servis
   ishga tushganda buni o'zi tekshirib ogohlantiradi.
3. Panel'ni restart (yangi `/internal/session-check` va navigatsiya):
   ```bash
   sudo systemctl restart fikrlovchi-panel
   ```
4. nginx konfigini yangilash. **Diqqat:** serverdagi faylga certbot 443
   blokini qo'shgan — git'dagi nusxa ustiga tushsa TLS yo'qoladi. Shuning
   uchun nusxalab, darhol certbot'ni qayta yurgizamiz (u TLS blokini
   qaytadan yozadi):
   ```bash
   sudo cp /root/stocker/deploy/nginx-stocker.uz.conf /etc/nginx/sites-available/stocker.uz && sudo nginx -t && sudo certbot --nginx -d stocker.uz -d www.stocker.uz --redirect
   ```
5. Tekshirish: `https://stocker.uz/pdf/` — panel sessiyasi bilan darhol
   ochilishi kerak (ikkinchi parol so'ralmasin). Panel'dan chiqib turib
   `/pdf/` ni ochsangiz — `/login` ga qaytarishi kerak.

**fikrlovchi.uz'dan voz kechish** — hammasi tasdiqlangandan keyin:

```bash
sudo rm -f /etc/nginx/sites-enabled/fikrlovchi.uz /etc/nginx/sites-enabled/buyo.fikrlovchi.uz && sudo nginx -t && sudo systemctl reload nginx
```

`uzum.fikrlovchi.uz` ni **darhol o'chirmaslikni** tavsiya qilaman: eski
telefonlarda va desktop client'da saqlangan manzil hali o'sha bo'lishi mumkin.
Hamma qurilma `stocker.uz/pack` ga o'tganini ko'rgach o'chiriladi.

### 6.4 Ish joylari kartasi — PLAN 6.5

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
