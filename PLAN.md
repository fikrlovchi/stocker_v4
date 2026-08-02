# Stocker v4 — Yig'ish (packing) tizimi: reja

Uzum buyurtmalarini omborda **barcode skanerlab yig'ish**, har skan uchun **ShK**
yorlig'ini va buyurtma tugaganda **BIG** yorlig'ini termo printerdan avtomatik
chiqarish tizimi.

Uch qismdan iborat: **mobil ilova** (Expo/Android) + **server** (Node) + **desktop
print client** (Electron, Windows). Boshqaruv va loglar — `fikrlovchi-panel`da.

---

## 1. Tasdiqlangan qarorlar

| # | Savol | Qaror |
|---|---|---|
| 1 | Mobil platforma | **React Native (Expo)**, Android APK. iOS keyinchalik (kod bir xil) |
| 2 | ShK matni | **O'zgarmaydi.** `uzum_order_detail!I` (MoySklad href) faqat **barcode ro'yxatini** olish uchun |
| 3 | Buyurtma tanlash | **Server avtomatik tanlaydi**, operator almashtira olmaydi |
| 4 | Skan boshiga yorliq | **2 ta** (1 birlik = 2 bet). Miqdor 3 → 3 marta skan |
| 5 | Desktop client | **Electron tray + WebSocket** |
| 6 | Printerlar | ShK → **Proton DTP-4207** (40×30 mm) · BIG → **Gainsha GS-2408** (101.6×101.6 mm) |
| 7 | Yakunlash | MoySklad holati **"Собран"** + Telegram xabar |
| 8 | Operatorlar | Bir nechta, alohida login. **Panel'dan boshqariladi** |
| 9 | Ish joylari | Bir nechta PC, telefon **QR orqali** juftlanadi |
| 10 | Buyurtma filtri | **Hold oynasidagilar QATNASHMAYDI** → 3.1-bo'limga qarang (filtr aniqlashtirildi) |
| 11 | Yig'ish tarixi | Faqat Google Sheets (`uzum_packing` varag'i) |
| 12 | Domen | `uzum.fikrlovchi.uz` · dashboard `/`, packing API `/pack/` |

---

## 2. Kodni o'rganishda topilgan 3 ta muhim narsa

### ✅ 2.1 "Собран" = eski `protectedHref` — va u endi ishlatilmaydi

Siz bergan href:
```
.../states/e3f3673f-8cc0-11f0-0a80-17c2003635fe
```
bu `uzumOrderToMC/config.json` dagi `protectedHref` bilan **aynan bir xil**.
`HANDOFF.md:93`: *"`protectedHref` — endi **ishlatilmaydi** (cancelSync'dan olib
tashlandi)"*.

**Xulosa: to'qnashuv yo'q.** Bu holat hozir hech qayerda o'qilmaydi ham,
yozilmaydi ham — biz uni bemalol "yig'ilgan" belgisi sifatida egallashimiz mumkin.
Hold buyurtmalarni chiqarib tashlaganingiz bilan birga, **`uzumOrderToMC` ga
umuman kod o'zgarishi kerak emas** (oldingi rejadagi `orderStatusSync` xavfi
yo'qoldi).

### ❌ 2.2 `V` ustuni "bekor qilingan" degani EMAS — filtr sifatida yaramaydi

`cancelSync.js:148-156` va `HANDOFF.md:100-104`: buyurtma tushganidan **24 soat**
o'tgach, bekor qilinmagan bo'lsa ham `V=1` qilib qo'yiladi (monitoring tugadi
degani).

Ya'ni **"V bo'sh"** filtri 24 soatdan oshgan har qanday sog'lom buyurtmani ham
yig'ish navbatidan **yo'qotib yuboradi**. Dam olish kuni yoki backlog bo'lsa
darhol muammo.

Bekor qilinganni sheetdan aniqlab bo'lmaydi — bekor qilingan ham, avto-yopilgan
ham `U="done", V=1` bo'lib qoladi. Yechim 3.1-bo'limda.

### ✅ 2.3 BIG — `fit-to-page` (qaror qabul qilindi)

Gainsha GS-2408 qog'ozi **101.6×101.6 mm (4"×4")**. Uzum FBS `LARGE` label
PDF'ining bet o'lchami har xil bo'lishi mumkin — qaroringizga ko'ra u **shu
qog'ozga sig'dirib** (`fit-to-page`) chiqariladi, alohida moslashtirilmaydi.

SumatraPDF: `-print-settings "fit"` (ShK esa `noscale` — u aniq o'lchamda
yasaladi).

> Bir martalik tekshiruv tavsiya etiladi: birinchi chiqqan BIG yorlig'ini
> telefon bilan skanerlab ko'ring. Agar o'qilsa — mavzu yopiq.

---

## 3. Ma'lumot oqimi — 3 kunlik kesh

### 3.1 Qaysi buyurtmalar yig'ishga chiqadi (aniqlashtirilgan filtr)

`uzum_order` ustunlari (`HANDOFF.md:75-83`):
`Q`=MoySklad'da yaratilgan · `T`=Uzum'da tasdiqlangan · `U`=bo'sh/`hold`/`done` · `V`=cancelHandled

| Shart | Sabab |
|---|---|
| `Q = 1` | MoySklad'da buyurtma yaratilgan |
| `T = 1` | Uzum'da tasdiqlangan. Tasdiqlanmasdan bekor bo'lganlar `T` bo'sh qoladi |
| `U = "done"` | **Hold chiqib ketadi** (`U="hold"`) va hali ishlanmaganlar ham (`U` bo'sh) |
| `W` oxirgi 3 kun ichida | Kesh oynasi |
| MoySklad'da bekor qilinmagan | Pastga qarang |
| `uzum_packing` da yo'q | Allaqachon yig'ilgan emas |

`V` **umuman ishlatilmaydi** (2.2-band).

**Bekor qilinganlarni aniqlash — 1 ta so'rov:**
```
GET /entity/customerorder?filter=state=<canceledHref>;created>=<3 kun oldin>&limit=1000
```
`externalCode` = Uzum orderId (`moysklad.js:66` shunday qidiradi). Har yangilanish
tsiklida bitta so'rov — arzon.

**Qo'shimcha himoya:** sessiya ochilayotganda o'sha bitta buyurtma uchun
`GET customerorder/{S}` qilib holati tekshiriladi. Yig'ish boshiga 1 ta so'rov —
MoySklad limitiga (45/3 s) hech qanday bosim yo'q.

### 3.2 Buyurtma keshi (har ~60 s)

1. `uzum_order!A:W`, `uzum_order_detail!A:L`, `uzum_packing!A:L` — bitta `batchGet`.
2. Yuqoridagi filtr qo'llanadi.
3. Har detail qatoridan: `B`=Uzum barcode, `C`=skuTitle, `I`=MoySklad href, `K`=miqdor.
4. 3 kundan oshganlar o'chiriladi.

### 3.3 MoySklad barcode keshi (alohida, uzunroq TTL)

`uzum_order_detail!I` → `GET <href>` → `barcodes[]` (`{ean13:...}`, `{code128:...}`)
→ tekis ro'yxat.

- **TTL 7 kun**, kalit = UUID. Tovar barcode'i kamdan-kam o'zgaradi → MoySklad'ga yuk deyarli yo'q.
- `I` da to'liq href ham, yalang'och UUID ham bo'lishi mumkin — ikkalasi qabul qilinadi.
- Tunda bir marta `GET /entity/assortment` sahifalab to'liq yangilanadi
  (`addBarcodeToMC/fetch_barcodes.py` mantiqining Node varianti).
- `msFetch` (429 retry) mantiqi `uzumOrderToMC/src/moysklad.js` dan ko'chiriladi.

### 3.4 Barcode indeksi

```
normalize(barcode) → [ {orderId, itemId, needed: K, scanned: n}, ... ]
```
Bitta item **Uzum barcode'i** bilan ham, **MoySklad barcode'lari** bilan ham topiladi.

---

## 4. Skan mantiqi

`POST /pack/api/scan { barcode, stationId }`

**A. Ochiq sessiya YO'Q:**
1. Barcode indeksdan qidiriladi.
2. Nomzodlar: mos filtrdan o'tgan, boshqa operator lock qilmagan.
3. **Avtomatik tanlash**: (a) eng kam tovarli, (b) teng bo'lsa eng eski (`W`).
4. MoySklad'da holat tekshiriladi (3.1) → bekor bo'lsa keyingi nomzod.
5. Sessiya + **lock** (TTL 15 daqiqa). ShK print job (2 bet).
6. Javob: buyurtma raqami, tovarlar ro'yxati, progress `1/N`.

**B. Ochiq sessiya BOR:**
- Joriy buyurtmadagi skan qilinmagan birlikka mos → progress +1, ShK ×2
- Boshqa buyurtmaniki → `WRONG_ITEM`
- Miqdor to'lgan → `ALREADY_COMPLETE`
- Topilmadi → `UNKNOWN_BARCODE`
- `N/N` → BIG print job + yakunlash (7-bo'lim)

**Endpointlar:** `/login` · `/pair` · `/scan` · `/session` (GET/cancel) · `/reprint` · `/station/status`

---

## 5. Yorliqlar va chop etish

### 5.1 ShK — Proton DTP-4207, 40×30 mm

**40 mm × 30 mm = 113.4 × 85.0 pt** (203 dpi → 320 × 240 nuqta).

Hozirgi ShK **594×420 pt** (≈A5) va `qrSize: 360` — bu 40×30 ga umuman
sig'maydi. Mavjud `createProductsPdf` vertikal aylantirilgan matn uchun qattiq
yozilgan; uni parametrlash o'rniga **alohida `createShkSmall()` funksiyasi**
yoziladi. Dashboard'dagi A5 varianti o'zgarishsiz qoladi.

Boshlang'ich maket (chapdan o'ngga):
```
┌────────────────────────────────┐ 30 mm
│  ┌──────────┐   1173 6084|5|   │  ← buyurtma № (oxirgi 4 ta yirik/qalin)
│  │          │   1000111953348  │  ← shtrix-kod
│  │    QR    │   MT2-ELEGANT,SS │  ← skuTitle (kesilgan)
│  │  ~21 mm  │                  │
│  └──────────┘                  │
└────────────────────────────────┘ 40 mm
```
- QR 60×60 pt (≈21 mm) → 13 xonali raqam uchun version 1, modul ≈8 nuqta — bemalol o'qiladi
- `mc_product!E` (tovar nomi) 40×30 ga **sig'maydi** — tashlanadi yoki 5pt bilan 1 qator

> Aniq maket **fizik sinov bilan** tasdiqlanadi: 3-fazada namuna PDF yasab,
> haqiqiy printerdan chiqarib ko'rasiz. Nima majburiy ekanini o'shanda aniqlaymiz.

### 5.2 BIG — Gainsha GS-2408, 101.6×101.6 mm

**288 × 288 pt.** Uzum'ning `LARGE` label'i o'zgarishsiz olinadi va qog'ozga
**sig'dirib** chiqariladi (`-print-settings "fit"`, 2.3-band). PDF qayta
yasalmaydi — kesh'dagi fayl to'g'ridan-to'g'ri printerga boradi.

### 5.3 Print quvuri

Server → client (WebSocket):
```json
{ "type": "print", "jobId": "uuid", "target": "shk", "url": "https://.../job/uuid.pdf" }
```
Client PDF'ni yuklab oladi, chop etadi, **ACK** qaytaradi.

- `jobId` **idempotent** — qayta ulanishda takroriy chop etilmaydi
- ACK kelmasa 30 s dan keyin qayta (3 marta), keyin xato
- Client oflayn → job navbatda, telefonda ogohlantirish, 2 daqiqadan keyin Telegram

**Windows'da chop etish — SumatraPDF** (client ichida, ~8 MB):
```
SumatraPDF.exe -print-to "<printer>" -silent -print-settings "noscale" file.pdf
```
Electron'ning `webContents.print` emas: termo yorliqda aniq o'lcham kerak,
Electron masshtablab yuboradi va printer tanlash ishonchsiz.

### 5.4 Client oynasi (tray)

Station nomi + juftlash QR · 2 ta printer dropdown (Windows ro'yxatidan) ·
har biriga Test print · jonli navbat + oxirgi 50 job · ulanish indikatori ·
Windows bilan autostart.

---

## 6. fikrlovchi-panel bilan integratsiya

Panel `better-sqlite3` + Express 5 + EJS, bitta admin (`ADMIN_PASSWORD_HASH`).

### 6.1 Loyihani ro'yxatga olish

```bash
node scripts/seed-project.js stocker "Stocker — yig'ish"
```
→ `PANEL_API_KEY` ni `stocker/server/.env` ga.

`src/config/manageable-units.js` ga:
```js
'stocker': {
  serviceUnit: 'stocker-server.service',
  envPath: '/root/stocker/server/.env',
},
```
> ⚠️ Panel'ning boshqaruvi **systemd timer** ga mo'ljallangan (interval, pause,
> run-now). Stocker esa **doimiy daemon** — timer yo'q. `projectControl.js` ni
> `timerUnit` bo'lmaganda faqat start/stop/restart ko'rsatadigan qilib kichik
> tuzatish kerak.

### 6.2 Loglar

Mavjud `POST /api/ingest/runs` ishlatiladi (`X-Project-Slug` + `Bearer`).
Daemon "run" tushunchasiga to'g'ridan-to'g'ri tushmagani uchun: **har 5 daqiqada
bitta "run"** yuboriladi — o'sha oynada yig'ilgan buyurtmalar soni
(`successCount`), xatolar (`errorCount`) va log qatorlari. Xato bo'lsa darhol.

> Panel faqat `INFO` va `ERROR` darajalarini qabul qiladi (`WARN` yo'q) —
> ogohlantirishlar `INFO` sifatida `⚠️` prefiksi bilan yuboriladi.

### 6.3 Telegram

Panel'ning `telegram_bots / telegram_chats / telegram_topics` katalogidan
tanlanadi, `project_telegram_links` orqali bog'lanadi va `.env` ga yoziladi.
`uzumOrderToMC` bilan bir xil kalitlar: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`TELEGRAM_TOPIC_ID`.

### 6.4 Operatorlar — panel'ga YANGI funksiya

Panel'da hozir foydalanuvchilar jadvali **yo'q** (faqat bitta admin). Boshida
**2 ta operator**, lekin son cheklanmagan — panel'dan istalgancha qo'shiladi.

Migratsiya `007_project_users.sql` — loyihaga bog'langan **umumiy** jadval
(faqat stocker uchun emas, keyin boshqa loyihalarga ham asqotadi):
```sql
CREATE TABLE project_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, login)
);
```

Loyiha sahifasiga **"Operatorlar"** kartasi: qo'shish · nomini o'zgartirish ·
parolni tiklash · faolsizlantirish (`bcryptjs` allaqachon bog'liqlikda bor).
Faolsizlantirilgan operatorning ochiq sessiyasi darhol uziladi.

API: `GET /api/project-users` (loyiha kaliti bilan) →
`[{login, display_name, password_hash, is_active}]`.

**Muhim**: stocker-server bu ro'yxatni har 60 s da tortib, o'z SQLite'iga
keshlaydi va login'ni **mahalliy** tekshiradi. Panel o'chib qolsa ham operatorlar
ishlayveradi — `uzumOrderToMC` dagi "panel muammosi asosiy ishga ta'sir qilmaydi"
tamoyili.

### 6.5 Ish joylari (PC client) — panel'dan boshqariladi

Stationlar soni ham cheklanmagan. Migratsiya `008_stocker_stations.sql`:
```sql
CREATE TABLE stocker_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,          -- "Ombor-1", "Ombor-2"
  enroll_code TEXT,                   -- bir martalik, ishlatilgach NULL
  token_hash TEXT,                    -- client doimiy tokeni
  shk_printer TEXT,                   -- Windows printer nomi
  big_printer TEXT,
  last_seen_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
```

**Yangi PC qo'shish tartibi:**
1. Panel'da **"Ish joyi qo'shish"** → nom kiritiladi → **bir martalik kod** chiqadi
2. O'sha PC'da Electron client birinchi marta ochilganda kod kiritiladi
3. Client doimiy token oladi, kod kuyadi. Printerlar client'da tanlanadi va
   panel'ga qaytariladi

**Panel'da "Ish joylari" kartasi ko'rsatadi:** nom · onlayn/oflayn · oxirgi
ko'rinish vaqti · tanlangan 2 ta printer · navbatda nechta job · **tokenni bekor
qilish** tugmasi.

> Nega bir martalik kod: `/pack/` internetdan ochiq bo'ladi. Kodsiz o'z-o'zidan
> ro'yxatdan o'tish bo'lsa, begona kompyuter station bo'lib ulanib, yorliqlarni
> o'ziga tortib olishi mumkin. Kod bitta PC uchun bir marta kiritiladi — ortiqcha
> yuk emas.

**Telefon–station bog'lanishi** o'zgarishsiz: client oynasidagi QR (6-bo'lim),
operator smena boshida skan qiladi. Bir station'ga bir nechta telefon ulana oladi.

---

## 7. Yakunlash

1. **BIG print job** → 2-printer.
2. **MoySklad**: `customerorder` holati → **"Собран"**
   (`e3f3673f-8cc0-11f0-0a80-17c2003635fe`). `setOrderState` mantiqi qayta ishlatiladi.
   Hech qanday to'qnashuv yo'q (2.1-band).
3. **Google Sheets** — yangi varaq `uzum_packing` (append-only):

   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | packingId | orderId | operator | station | boshlangan | tugagan | tovar soni | skan soni | holat |

   *Nega yangi varaq:* `uzum_order`ning oraliq ustunlarida formulalar bor
   (`orderFetch.js:152-156` shu sababdan `W`ni alohida yozadi). Alohida
   append-only varaq xavfsiz va bu varaq **"allaqachon yig'ilgan"** filtri
   sifatida ham xizmat qiladi (3.1).

4. **Telegram**: xatolar darhol; kunlik yakun ixtiyoriy.
5. Lock bo'shatiladi, telefon "keyingi skan" holatiga qaytadi.

---

## 8. Domen va TLS

Serverda nginx + certbot allaqachon bor (`fikrlovchi.uz`, `buyo.fikrlovchi.uz`).

**1. DNS**: `uzum.fikrlovchi.uz` uchun **A record** → server IP (`64.226.69.129`).
Tarqalishini kuting: `dig uzum.fikrlovchi.uz`

**2. `/etc/nginx/nginx.conf`** ichidagi `http { }` blokiga (WebSocket uchun, bir marta):
```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
```

**3. `/etc/nginx/sites-available/uzum.fikrlovchi.uz`**:
```nginx
server {
    listen 80;
    server_name uzum.fikrlovchi.uz;

    location / {                                  # uzumPDFs dashboard
        proxy_pass http://127.0.0.1:4040;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }

    location /pack/ {                             # stocker API + WebSocket
        proxy_pass http://127.0.0.1:4043/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

**4. Yoqish va TLS**:
```bash
sudo ln -s /etc/nginx/sites-available/uzum.fikrlovchi.uz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d uzum.fikrlovchi.uz
```
Certbot konfiguratsiyani o'zi HTTPS'ga o'tkazadi va yangilash timer'ini qo'yadi.

**5. Keyin**:
- `uzumPDFs/.env`: `PUBLIC_BASE_URL=https://uzum.fikrlovchi.uz`
- `uzumPDFs/main.js:466` — `app.listen(4040)` → `app.listen(4040, "127.0.0.1")`,
  stocker ham `127.0.0.1:4043`. Tashqaridan faqat nginx orqali kirilsin
  (`ufw deny 4040,4043`).
- Cookie `Secure` bayrog'i avtomatik yoqiladi — `main.js:56` `x-forwarded-proto`ni
  tekshiradi, nginx uni yuboradi. ✅

---

## 9. uzumPDFs'ga o'zgarishlar

| O'zgarish | Izoh |
|---|---|
| `buildProductForItem(orderId, itemId)` | `sheetData.js:56` dagi mantiqni bitta qator uchun ajratish. `/process` o'zgarmaydi |
| `createShkSmall()` | `createPdf.js` ga 40×30 mm uchun yangi renderer |
| `POST /internal/shk-item` | `{orderId, itemId, copies}` → 2 betli ShK PDF |
| `GET /internal/big/:orderId` | Kesh'dagi Uzum label (`getLabelPdf`) |
| `X-Service-Token` | Internal endpointlar uchun (cookie auth emas) |
| `app.listen(4040, "127.0.0.1")` | nginx orqasiga yashirish |

Yorliq matnini **uzumPDFs o'zi hisoblaydi** — stocker tayyor matn yubormaydi.
Shunda format bitta joyda qoladi va ikki loyiha bir-biridan ajralib ketmaydi.

BIG uchun label allaqachon kesh'da (`uzumOrderToMC/src/labels.js` import paytida
oldindan oladi) — yig'ish paytida Uzum API'ga chiqilmaydi. `LABEL_CACHE_DIR`
uchala servisda bir xil bo'lishi shart.

---

## 10. Xatolik holatlari

| Holat | Xatti-harakat |
|---|---|
| Barcode topilmadi | Qizil + vibratsiya + ovoz |
| Boshqa buyurtmaniki | Kutilayotgan tovarlar ro'yxati ko'rsatiladi |
| Miqdor to'lgan | "Bu tovar to'liq skan qilingan (3/3)" |
| Boshqa operator olgan | Avto-tanlashda o'tkazib yuboriladi |
| Sessiya tashlab ketilgan | 15 daqiqada lock avtomatik bo'shaydi + "Bekor qilish" tugmasi |
| Yig'ish paytida bekor bo'ldi | Sessiya ochilishida MoySklad tekshiruvi (3.1); ochilib bo'lgan bo'lsa Telegram |
| Printer oflayn | Job navbatda, telefonda sariq ogohlantirish, 2 daqiqadan keyin Telegram |
| Telefon internetni yo'qotdi | Sessiya **serverda** — qayta ulanganda `GET /session` bilan tiklanadi |
| Yorliq buzuq chiqdi | "Qayta chiqarish" (oxirgi ShK / BIG) |

---

## 11. Repo tuzilishi

```
stocker_v4/
├─ server/                  Node ESM, 127.0.0.1:4043
│  ├─ src/
│  │  ├─ index.js           Express + WS
│  │  ├─ cache/             sheets o'qish, order/item kesh, MoySklad cancel ro'yxati
│  │  ├─ barcodes/          MoySklad barcode olish + indeks
│  │  ├─ scan/              sessiya, lock, holat mashinasi
│  │  ├─ print/             job navbati, WS hub, retry
│  │  ├─ finalize/          MoySklad "Собран", uzum_packing, Telegram
│  │  ├─ auth/              operator (panel'dan kesh) + station
│  │  └─ panel/             ingest reporter, operator sync
│  ├─ data/stocker.db       SQLite (better-sqlite3)
│  ├─ config.json
│  └─ deploy/stocker-server.service
├─ mobile/                  Expo — Login, Pair, Scan, Progress, Settings
├─ desktop/                 Electron tray + vendor/SumatraPDF.exe
└─ PLAN.md
```

**SQLite** — tranzaksiyali (lock uchun **muhim**), fayl-asosli, panel bilan bir xil
kutubxona. Jadvallar: `orders`, `items`, `barcodes`, `mc_barcodes`, `sessions`,
`print_jobs`, `stations`, `operators_cache`, `sheets_outbox`.

---

## 12. Fazalar

| Faza | Ish | Kun |
|---|---|---|
| ~~**1**~~ | ~~Server yadrosi: Sheets o'qish, filtr (3.1), MoySklad cancel ro'yxati, SQLite, tozalash~~ **✅ BAJARILDI** — `server/`, [README](server/README.md), 39 ta test o'tdi | 2 |
| ~~**2**~~ | ~~MoySklad barcode olish + indeks + qidiruv testi~~ **✅ BAJARILDI** — 7 kunlik kesh, bulk so'rov, tungi to'liq sinxronizatsiya, 48 ta test | 1.5 |
| **3** | uzumPDFs: `createShkSmall()` 40×30 + `buildProductForItem` + internal endpointlar + **fizik sinov chop etish** | 1.5 |
| **4** | Skan mantiqi: sessiya, lock, avto-tanlash, progress API | 2 |
| **5** | Print quvuri: WS hub, navbat, idempotentlik, retry | 1.5 |
| **6** | Electron client: WS, printer tanlash, SumatraPDF, QR, tray, autostart | 2.5 |
| **7** | Expo mobil: login, QR juftlash, skan, progress, xatolar, reprint | 3 |
| **8** | Panel: `project_users` + `stocker_stations` migratsiyalari, Operatorlar va Ish joylari kartalari, API, daemon boshqaruvi tuzatishi | 2 |
| **9** | Yakunlash: "Собран", `uzum_packing`, Telegram, ingest reporter | 1 |
| **10** | Deploy: DNS, nginx, certbot, systemd, APK, ombor sinovi | 1.5 |
| | **Jami** | **~18.5 kun** |

1–5 telefon/printersiz `curl` bilan test qilinadi. 6, 7, 8 parallel ketishi mumkin.

---

## 13. Boshlashdan oldin kerak

| # | Nima | Holat |
|---|---|---|
| 1 | MoySklad "Собран" href | ✅ olindi |
| 2 | Operator boshqaruvi | ✅ panel'da, cheklanmagan son (6.4) |
| 3 | Ish joyi (PC) qo'shish | ✅ panel'da, cheklanmagan son (6.5) |
| 4 | Printerlar | ✅ DTP-4207 40×30 · GS-2408 101.6×101.6 |
| 5 | BIG chop etish rejimi | ✅ `fit-to-page` |
| 6 | Domen + TLS | ✅ 8-bo'limda tayyor ko'rsatma |
| 7 | Telegram | ✅ panel'dan |
| 8 | Platforma | ✅ Android (Expo) |
| **9** | **Dastlabki 2 operator** | ⏳ **sizdan** — login nomlari va to'liq ismlari |
| **10** | **40×30 yorliqda nima majburiy** | ⏳ 3-fazada namuna chiqarib birga hal qilamiz |

---

## 14. Qolgan risklar

| Risk | Yumshatish |
|---|---|
| 40×30 ga QR + matn sig'masligi | 3-fazada fizik sinov; kerak bo'lsa QR kichraytiriladi yoki matn qisqartiriladi |
| BIG siqilganda shtrix o'qilmasligi | Ehtimoli past, siz qaror qildingiz. Birinchi yorliqni skanerlab tekshirish kifoya (2.3) |
| Bir xil barcode turli SKU'larda | Startup'da aniqlanib loglanadi + bir marta Telegram |
| `I` ustuni bo'sh (XLOOKUP `#N/A`) | Faqat Uzum barcode'i bilan topiladi; `skuAlerts.js` allaqachon xabar beradi |
| Sheets kvotasi | O'qish bitta `batchGet`; yozuvlar to'plamlanadi. uzumOrderToMC bilan umumiy kvota |
| Panel daemon boshqaruvi | 6.1-banddagi kichik tuzatish; ishlamasa `systemctl` bilan qo'lda |
