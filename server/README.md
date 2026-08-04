# stocker-server

Uzum buyurtmalarini omborda skanerlab yig'ish serveri. To'liq reja: [../PLAN.md](../PLAN.md).

**Hozirgi holat: 1, 2, 4, 5-fazalar bajarildi** — buyurtma keshi, barcode
indeksi (Uzum + MoySklad), skan mantiqi (sessiya, lock, avtomatik buyurtma
tanlash) va chop etish quvuri (WebSocket hub, navbat, ACK, qayta urinish).
Desktop client (6-faza), mobil ilova (7-faza) va autentifikatsiya (8-faza)
hali yo'q.

## Nima qiladi

Har 60 soniyada Google Sheets'dan `uzum_order`, `uzum_order_detail` va
`uzum_packing` varaqlarini o'qiydi, MoySklad'dan bekor qilingan buyurtmalar
ro'yxatini hamda tovar barcode'larini oladi va yig'ishga tayyor buyurtmalarni
SQLite keshiga yozadi. Barcode bo'yicha buyurtma topish uchun indeks quradi.

## Buyurtma qaysi shartda yig'ishga chiqadi

| Shart | Sabab |
|---|---|
| `uzum_order!Q = 1` | MoySklad'da yaratilgan |
| `uzum_order!T = 1` | Uzum'da tasdiqlangan |
| `uzum_order!U = "done"` | MoySklad holati o'rnatilgan — **kutish oynasidagilar** (`hold`) **va hali ishlanmaganlar** (bo'sh) chiqib ketadi |
| `uzum_order!W` oxirgi 3 kun ichida | Kesh oynasi (`W` bo'sh bo'lsa `C` ishlatiladi) |
| MoySklad'da "Otmenen" emas | Bitta bulk so'rov, `externalCode` bo'yicha |
| `uzum_packing`da `done` yozuvi yo'q | Allaqachon yig'ilmagan |

> ⚠️ **`uzum_order!V` ATAYLAB ishlatilmaydi.** `cancelSync.js:148` buyurtma
> tushganidan 24 soat o'tgach, bekor qilinmagan bo'lsa ham `V=1` qo'yadi
> (monitoring tugadi degani). V bo'yicha filtrlash 24 soatdan oshgan sog'lom
> buyurtmalarni yo'qotib yuborardi. Shuning uchun bekor qilinganlik faqat
> MoySklad holatidan aniqlanadi.

Mos kelmagan buyurtmalar ham keshda saqlanadi — `eligible=0` va **sababi** bilan.
Shunda "nega bu buyurtma skanerlanmayapti?" savoliga `/debug/order/<id>` javob
beradi. Faqat 3 kunlik oynadan tashqaridagilar umuman saqlanmaydi.

## Barcode indeksi — ikkita manba

Operator **Uzum barcode'ini ham, MoySklad'dagi istalgan barcode'ni ham**
skanerlay oladi:

| Manba | Qayerdan | Kesh |
|---|---|---|
| `uzum` | `uzum_order_detail!B` | Har tsiklda qayta quriladi |
| `moysklad` | `uzum_order_detail!I` (href) → `GET assortment` → `barcodes[]` | **7 kun** (`mc_products` / `mc_barcodes`) |

Tovar barcode'i kamdan-kam o'zgaradi, shuning uchun bir marta olingan UUID
qayta so'ralmaydi. Yangilash **ikki bosqichli**:

1. **To'liq assortiment** — `GET /entity/assortment?limit=1000&offset=N`,
   sahifalab, filtrsiz. Kesh sovuq yoki 7 kundan eski bo'lsa ishga tushadi.
   570 ta tovar uchun 570 ta so'rov emas, bir necha sahifa.
2. **Qoldiqlar** — katalogda topilmaganlar (masalan hozirgina yaratilgan yoki
   arxivlangan tovar) bittalab `GET /entity/<type>/<uuid>` orqali olinadi.
   `syncBudgetPerCycle` bilan cheklangan, ya'ni yangilanish tsiklini bloklamaydi.

> **Nega bulk `filter=id=` emas:** `assortment` endpointining `id` filtri href
> qabul qilmaydi — MoySklad **1014** xatosi bilan rad etadi. Sahifalab o'qish
> esa ishonchli: aynan shu usul `addBarcodeToMC/fetch_barcodes.py` da ishlab
> turibdi.

Kechasi soat 3:00 (Toshkent) da to'liq assortiment majburiy qayta o'qiladi —
MoySklad'da barcode qo'shilgan/o'chirilgan bo'lsa 7 kunlik TTL kutilmaydi.

`uzum_order_detail!I` da to'liq href ham, yalang'och UUID ham bo'lishi mumkin —
ikkalasi ham qabul qilinadi. Entity turi (`J`) noma'lum bo'lsa `product` va
`variant` variantlari birga so'raladi. MoySklad'da topilmagan UUID 24 soat
qayta so'ralmaydi va loglanadi.

> **Yorliq matni bundan o'zgarmaydi.** ShK sarlavhasi hamon
> `skuTitle , mc_product!E` (PLAN.md, 2-qaror). MoySklad'dan olingan nom faqat
> diagnostika va mobil ilova ekranida ko'rsatish uchun saqlanadi.

## Skan mantiqi

`POST /api/scan { barcode, operator, stationId }`

**Operatorda ochiq sessiya yo'q** → barcode bo'yicha buyurtma qidiriladi,
**avtomatik tanlanadi** (eng kam tovarli, teng bo'lsa eng eski) va LOCK
qilinadi. **Ochiq sessiya bor** → barcode faqat shu buyurtmaga tegishli
bo'lishi kerak.

| `result` | Ma'nosi |
|---|---|
| `order_opened` | Buyurtma topildi va ochildi (birinchi skan hisobga olindi) |
| `ok` | Navbatdagi birlik yopildi |
| `order_complete` | Oxirgi birlik — buyurtma yig'ildi, BIG chop etishga |
| `wrong_item` | Bu tovar joriy buyurtmaga tegishli emas |
| `already_complete` | Bu tovar to'liq skanerlangan |
| `unknown_barcode` | Barcode hech qayerda topilmadi |
| `no_available_order` | Tovar bor, lekin buyurtma band / bekor / yig'ilgan |

Xato natijalar ham **HTTP 200** bilan qaytadi — ilova `result` maydoniga
qarab ovoz/vibratsiya beradi.

### LOCK qanday ishlaydi

`sessions` jadvalidagi **qisman UNIQUE indeks** (`status='active'` bo'yicha):

```sql
CREATE UNIQUE INDEX idx_sessions_active_order ON sessions(order_id) WHERE status = 'active';
```

Ikki operator bir vaqtda bir buyurtmani ochmoqchi bo'lsa, ikkinchisining
`INSERT`i UNIQUE xatosi bilan tushadi va kod keyingi nomzodga o'tadi.
Alohida qulflash mexanizmi kerak emas — poyga (race) baza darajasida hal
bo'ladi. Ikkinchi indeks bitta operatorda bitta ochiq sessiyani kafolatlaydi.

Lock uchta yo'l bilan bo'shaydi: buyurtma yig'ilganda, operator bekor
qilganda, yoki **15 daqiqa** harakatsizlikdan keyin (`sessionTtlMinutes`,
har skanda uzayadi).

### Sessiya keshdan mustaqil

`orders`/`items`/`item_barcodes` har 60 soniyada `DELETE`+`INSERT` qilinadi.
Shuning uchun sessiya ochilganda tovarlar va **barcode'lar nusxalanadi**
(`session_items`, `session_barcodes`) — yangilanish tsikli ochiq sessiyani
buzmaydi.

## Chop etish quvuri

Har muvaffaqiyatli skan → **ShK, 2 nusxa**. Buyurtma yig'ilganda → **BIG, 1 ta**.

```
skan → print_jobs (pending) → WS orqali station'ga → sent → ACK → done
                                    ↑                    │
                                    └────────────────────┘  ACK kelmasa qayta
```

**Nega WebSocket:** telefon va PC bir tarmoqda bo'lishi shart emas. PC serverga
**o'zi ulanadi** (chiquvchi ulanish), server esa print buyrug'ini shu ochiq
kanal orqali yuboradi. Ish joyida port ochish yoki statik IP kerak emas.

Protokol (`ws://host/ws?stationId=X&token=Y`):

| Yo'nalish | Xabar |
|---|---|
| client → | `{type:"hello", stationId, name?, printers:{shk,big}}` |
| → client | `{type:"welcome", stationId}` |
| → client | `{type:"print", job:{id, target, copies, orderId, itemId, url}}` |
| client → | `{type:"ack", jobId, ok, error?}` |

**Idempotentlik:** `job.id` o'zgarmas. ACK kelmasa server 30 soniyadan keyin
qayta yuboradi (3 martagacha), client esa ko'rgan `jobId`ni eslab qolib
takror chop etmaydi. Allaqachon `done` bo'lgan jobga kelgan kechikkan ACK
holatni buzmaydi.

**PDF xavfsizligi:** desktop client PDF'ni to'g'ridan-to'g'ri uzumPDFs'dan
olmaydi. U `GET /job/<id>/pdf?t=<bir martalik token>` ga boradi, stocker esa
service token bilan uzumPDFs'ga chiqadi. Shunda service token faqat serverda
qoladi va ish joylaridagi kompyuterlarga tarqalmaydi.

Client'siz sinash uchun `POST /print/ack {jobId, ok}` bor.

## Mahalliy ishga tushirish (Windows)

```powershell
npm install
copy .env.example .env
```

`.env` ni to'ldiring (`MOYSKLAD_TOKEN`, `SERVICE_TOKEN`), so'ng `oauth.json` ni
nusxalang — u `uzumPDFs` loyihasida bor (git'ga tushmaydi, faqat serverda):

```bash
scp root@64.226.69.129:/root/uzumpdfs/oauth.json ./oauth.json
```

Keyin:

```bash
node src/index.js
```

## Tekshirish

**Google/MoySklad'siz — mantiq testi** (100 ta tekshiruv, vaqtinchalik bazada):

```bash
node src/scripts/selfTest.js
```

**Haqiqiy ma'lumot bilan — bir marta yangilash** (server ko'tarmasdan):

```bash
node src/scripts/refreshOnce.js
```

**Butun assortimentni majburiy qayta o'qish** (TTL va "topilmadi" belgisiga
qaramasdan — odatda kechasi 3:00 da avtomatik bajariladi):

```bash
node src/scripts/syncBarcodes.js
```

## Operator autentifikatsiyasi (8-faza)

Operatorlar **fikrlovchi-panel**da yaratiladi (loyiha sahifasi → "Operatorlar"),
stocker esa ro'yxatni `GET /api/ingest/project-users` orqali **har 60 s** da
tortib o'z SQLite'iga yozadi va login'ni **mahalliy** tekshiradi. Panel o'chib
qolsa ham operatorlar ishlayveradi — faqat yangi operator qo'shish yoki parol
tiklash to'xtaydi.

```
telefon ──POST /api/auth/login {login, password}──> stocker
        <──────── {token, login, displayName} ─────
telefon ──Authorization: Bearer <token>──────────> /api/scan ...
```

* Parol panel'dagi **bcrypt hash** bilan solishtiriladi (ochiq parol hech
  qayerda saqlanmaydi va uzatilmaydi).
* Token — 32 bayt tasodifiy qiymat, bazada faqat `sha256` hash'i. Muddati
  `auth.tokenTtlDays` (30 kun) — har smenada qayta kirish shart emas.
* Panel'da hisob **faolsizlantirilsa yoki o'chirilsa**, keyingi sinxronda uning
  barcha tokenlari o'chadi — ilova kirish ekraniga qaytadi.
* Bitta IP dan `auth.maxFailedAttempts` (5) marta xato parol → `auth.lockoutMs`
  (5 daqiqa) qulf.
* `/api/*` uchun **service token ham** qabul qilinadi (desktop client,
  diagnostika, selfTest). Operator tokeni bilan kelganda so'rov tanasidagi
  `operator` maydoni **e'tiborga olinmaydi** — nom tokendan olinadi.

`.env` da qo'shimcha o'zgaruvchi kerak emas: ro'yxat manzili
`PANEL_INGEST_URL` dan hosil qilinadi (`.../runs` → `.../project-users`).
Panel boshqa manzilda bo'lsa `PANEL_USERS_URL` beriladi.

## Endpointlar

`/health` va `/api/auth/login` ochiq; `/api/*` operator tokeni yoki
`X-Service-Token` talab qiladi; `/debug/*` va `/print/*` faqat service token.

| Endpoint | Vazifa |
|---|---|
| `POST /api/auth/login` | `{login, password, device}` → `{token, login, displayName}` |
| `GET /api/auth/me` | Token hali yaroqlimi (ilova ochilganda) |
| `POST /api/auth/logout` | Tokenni bekor qilish |
| `POST /api/scan` | `{barcode, stationId}` → skan natijasi + sessiya |
| `GET /api/session` | `?id=` yoki tokendagi operator. `&last=1` — yopilganini ham |
| `POST /api/reprint` | `{jobId}` — yorliqni qayta chiqarish (yangi job yasaladi) |
| `POST /api/session/cancel` | `{reason}` — sessiyani bekor qilish, lock bo'shaydi |
| `GET /api/sessions` | Hozir kim nimani yig'yapti |
| `GET /api/jobs?sessionId=` | Sessiyaning chop etish joblari |
| `GET /print/queue` | Navbat statistikasi + ulangan stationlar + joblar |
| `GET /print/stations` | Ish joylari, printerlari, onlayn holati |
| `POST /print/dispatch` | `{stationId}` — kutayotgan joblarni darhol yuborish |
| `POST /print/ack` | `{jobId, ok, error}` — client'siz sinash uchun |
| `GET /job/:id/pdf?t=` | PDF (job tokeni bilan; service token EMAS) |
| `WS /ws?stationId=&token=` | Desktop client kanali |
| `GET /health` | Oxirgi yangilanish holati (nginx/monitoring uchun) |
| `GET /debug/stats` | Kesh statistikasi + sabablar bo'yicha taqsimot |
| `GET /debug/orders` | Navbatdagi buyurtmalar ro'yxati. `?all=1` — nomoslar ham |
| `GET /debug/samples` | Skan sinovi uchun haqiqiy barcode namunalari |
| `POST /debug/refresh` | Keshni darhol yangilash |
| `GET /debug/order/:id` | Bitta buyurtma: tovarlari, barcode'lari, **mos/nomos va sababi** |
| `GET /debug/barcode/:code` | Barcode bo'yicha qidiruv. `?all=1` — nomos buyurtmalar ham |
| `GET /debug/product/:uuid` | MoySklad tovari: nomi, barcode'lari, kesh yoshi |
| `GET /debug/ambiguous` | Bir xil barcode turli tovarlarga biriktirilgan holatlar |
| `GET /debug/operators` | Keshdagi operatorlar: kim faol, ro'yxat qachon sinxronlangan |
| `POST /debug/sync-operators` | Operatorlarni panel'dan darhol qayta tortish |
| `POST /debug/sync-barcodes` | Butun assortimentni darhol qayta o'qish (odatda tunda avtomatik) |

Misollar:

```bash
curl -s -H "X-Service-Token: $TOKEN" http://127.0.0.1:4044/debug/stats
```

```bash
curl -s -H "X-Service-Token: $TOKEN" http://127.0.0.1:4044/debug/order/117360845
```

```bash
curl -s -H "X-Service-Token: $TOKEN" http://127.0.0.1:4044/debug/barcode/1000111953348
```

Javobdagi `source` maydoni barcode qaysi manbadan kelganini ko'rsatadi
(`uzum` yoki `moysklad`).

## Serverga yuklash

```bash
git clone <repo> /root/stocker
cd /root/stocker/server
npm ci --omit=dev          # better-sqlite3 serverda kompilyatsiya qilinadi
cp /root/uzumpdfs/oauth.json ./oauth.json
cp .env.example .env && nano .env
node src/scripts/refreshOnce.js    # sozlamalarni tekshirish
sudo cp deploy/stocker-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stocker-server
journalctl -u stocker-server -f
```

nginx/TLS sozlamasi: [../PLAN.md](../PLAN.md) 8-bo'lim.

Panel'ga ulash:

```bash
cd /root/fikrlovchi-panel && node scripts/seed-project.js stocker "Stocker — yig'ish"
```

Chiqqan kalitni `.env` dagi `PANEL_API_KEY` ga qo'ying.

## Tuzilishi

```
src/
├─ index.js               Express + yangilash tsikli
├─ config.js              config.json + .env
├─ logger.js              fayl + konsol + panel buferi
├─ cache/
│  ├─ readSheets.js       Sheets o'qish (render option'lar izohi bilan)
│  ├─ eligibility.js      buyurtma yig'ishga chiqadimi — yagona qaror joyi
│  ├─ refresh.js          applyRefresh (sof mantiq) + refreshCache (I/O)
│  └─ queries.js          keshdan o'qish, barcode qidiruvi
├─ moysklad/
│  ├─ client.js           msFetch (429 retry), holat o'qish
│  ├─ canceledOrders.js   bekor qilinganlar ro'yxati (1 so'rov)
│  └─ productBarcodes.js  tovar barcode'lari (7 kunlik kesh, bulk + tungi to'liq)
├─ auth/operators.js      panel'dan operator keshi, login, token, middleware
├─ scan/
│  ├─ sessions.js         sessiya, lock, avtomatik tanlash, holat mashinasi
│  └─ routes.js           /api/* (mobil ilova uchun)
├─ print/
│  ├─ jobs.js             navbat: yaratish, ACK, qayta urinish, stationlar
│  ├─ hub.js              WebSocket hub (desktop client)
│  ├─ pdf.js              uzumPDFs'dan PDF olish (service token serverda qoladi)
│  └─ routes.js           /job/:id/pdf, /print/*
├─ google/sheetsClient.js OAuth2 (uzbuyo@gmail.com)
├─ db/                    SQLite + migratsiyalar
├─ panel/reporter.js      fikrlovchi-panel'ga hisobot (har 5 daqiqa)
└─ scripts/
   ├─ selfTest.js         fixture bilan mantiq testi
   ├─ refreshOnce.js      bir marta yangilash
   └─ syncBarcodes.js     to'liq assortimentni majburiy o'qish
```

### Serverdagi portlar va servislar

`64.226.69.129` (Ubuntu, DigitalOcean). Stocker **4044** da tinglaydi.

| Port | Loyiha | Yo'li | Boshqaruvi | Domen |
|---|---|---|---|---|
| 80 / 443 | nginx | — | systemd `nginx` | barcha domenlar |
| 3000 | fikrlovchi-panel | `/root/fikrlovchi-panel` | systemd `fikrlovchi-panel` | `fikrlovchi.uz`, `buyo.fikrlovchi.uz` |
| 4040 | uzumPDFs | `/root/uzumpdfs` | **pm2** `uzumpdfs` | `uzum.fikrlovchi.uz/` |
| 4041 | receiveMCPost | `/root/receiveMCPost` | **pm2** `mc-webhook` | — (MoySklad webhook) |
| 4042 | mcCancelServer | `/root/uzumOrderToMC` | **pm2** `mc-cancel` | — |
| 4043 | analytics | `/root/analytics` | systemd `analytics` | `analytics.fikrlovchi.uz` |
| **4044** | **stocker-server** | `/root/stocker/server` | systemd `stocker-server` | `uzum.fikrlovchi.uz/pack/` |

**Ikki xil boshqaruv ishlatilgan** — yangi servis qo'shishda yoki qayta ishga
tushirishda chalkashmaslik uchun:

```bash
pm2 restart uzumpdfs                      # pm2 ostidagilar
sudo systemctl restart stocker-server     # systemd ostidagilar
```

Port band emasligini tekshirish:

```bash
ss -ltnp | grep :PORT
```

Port egasini to'liq aniqlash:

```bash
for p in $(ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -un); do pid=$(ss -ltnpH "sport = :$p" | grep -oP 'pid=\K[0-9]+' | head -1); [ -n "$pid" ] && printf "%-6s %s\n" "$p" "$(ps -p $pid -o args= | cut -c1-100)"; done
```

> Port to'qnashuvi bir marta bo'lgan: stocker dastlab 4043 ga qo'yilgan edi,
> u esa `analytics` tomonidan band edi. Diagnostika so'rovlari jimgina boshqa
> ilovaga tushib ketdi. Shuning uchun yangi servisda avval shu jadvalni
> tekshiring.

Port band qilmaydigan davriy vazifa bittagina: **`uzum-order.timer`** —
uzumOrderToMC asosiy sinxronizatsiyasi (Uzum → Sheets → MoySklad), har
2 daqiqada. `systemctl list-timers` bilan ko'riladi.

Domenlar (`/etc/nginx/sites-enabled/`), hammasi certbot TLS bilan:

| Domen | Port |
|---|---|
| `fikrlovchi.uz`, `www.fikrlovchi.uz` | 3000 |
| `buyo.fikrlovchi.uz` | 3000 |
| `analytics.fikrlovchi.uz` | 4043 |
| `uzum.fikrlovchi.uz` | `/` → 4040, `/pack/` → 4044 |

### Diqqat: qaysi jadvallar qayta quriladi

`orders` / `items` / `item_barcodes` / `packed_orders` har yangilanishda
`DELETE` + `INSERT` qilinadi. Keyingi fazalardagi sessiya/lock jadvallari bu
jadvallarga **FOREIGN KEY qo'ymasligi kerak** — sessiya ochilganda kerakli
maydonlarni nusxalab olsin, aks holda yangilanish ochiq sessiyani o'chirib
yuboradi.

`mc_products` / `mc_barcodes` / `canceled_orders` esa **saqlanib qoladi** —
ular uzoq muddatli kesh, TTL bo'yicha yangilanadi.
