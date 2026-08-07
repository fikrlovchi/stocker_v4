# Stocker v3 (Google Sheets + AppSheet) → server bazasi

2026-08-07 da qabul qilingan yo'nalish: AppSheet'da yasalgan Stocker v3 ning
bazasi — `18j8NDVJl9ZD-wuwlP3T1A1-sVoJlW_doFrwQrf-AvsE` jadvali — serverga
ko'chadi. **Joriy jarayonlar to'xtamaydi.**

## Qabul qilingan qarorlar

| Savol | Qaror |
|---|---|
| Ma'lumot manbai | **Server**. O'zgarish bazaga yoziladi, so'ng jadvalga ham ko'chiriladi — AppSheet v3 va joriy formulalar ishlayveradi |
| Tartib | **Avval o'qish, keyin yozish.** Har bosqichda bitta GAS trigger o'chadi va natija eski qiymat bilan solishtiriladi |
| Uzum buyurtmalari | Server Uzum API'dan **to'g'ridan-to'g'ri** tortadi, Google Sheets'ga **zaxira** sifatida yozib boriladi |
| MoySklad tokeni | Bitta joyda — **Konfiguratsiya** bo'limida. `.env` dagi `MOYSKLAD_TOKEN` bir marta ko'chirilib, keyin olib tashlanadi |
| `mc_product` | `importrange()` kerak emas — server MoySklad'dan o'zi o'qiydi (`gas_v3/volume_product.js` mantiqi) |
| Telegram | DMS v8 uslubi: `telegram_bot` + `telegram_chat` spravochnigi, integratsiyaga `bot + chat` biriktiriladi |

## Bo'limlar tuzilishi

Menyu kalitlari **o'zgarmaydi** (`user_permissions` da shu kalitlar yozilgan) —
faqat ko'rinadigan nom va ichki tuzilma o'zgaradi.

| Kalit | Eski nom | Yangi nom |
|---|---|---|
| `orders_to_mc` | Uzum order to MC | **Integratsiyalar** (+ "Qoldiq oqimlari" varag'i) |
| `settings` | O'zgaruvchilar | **Konfiguratsiya** |
| `link_product` | — | **Tovar bog'lamalari** (yangi) |
| `uzum_orders` | — | **Uzum buyurtmalari** (yangi) |
| `packing` · `labels` · `users` | — | o'zgarmaydi |

**Konfiguratsiya** ichki bo'limlari: Uzum (kabinet/token va do'konlar) ·
MoySklad (token) · Telegram (bot va chat) · Google Sheets · Uzum qoldiq
modifikatsiyasi · `.env` bog'lamalari.

## Manba jadval — nima nima bilan bog'liq

```
mc_token!A2 ─────────────────┐
                             ▼
volume_product.js  ──▶ mc_product (boshqa jadvaldan importrange)
                             │  B=uuid  C=entity  F=externalId
                             ▼
get_mcstock_v3.js  ──▶ mc_stock (MoySklad qoldig'i, to'liq almashtiriladi)
                             │
                             ▼
                        link_product          uzum_stock_mod
   A skuId · D barcode · F amount(FORMULA) ◀── uzum_stock_mod_detail
   G token · H bc→MC flag · I shopId
   J faol  · L (FORMULA) · M mc uuid
                    │            │
   stock_updater_v3 │            │ addBarcodeToMC
                    ▼            ▼
              Uzum FBS      MoySklad barcode
        v2/fbs/sku/stocks   entity/{type}/{uuid}
```

## Bosqichlar

### 1-bosqich — karkas ✅ (2026-08-07)

Jadval eksportini kutmasdan qilingan ish:

1. **Bo'limlar qayta nomlandi** — `orders_to_mc` → "Integratsiyalar",
   `settings` → "Konfiguratsiya", yangi `uzum_orders`. Kalitlar o'zgarmadi,
   shuning uchun ruxsatlar joyida qoldi; eski manzillar (`/orders-to-mc`,
   `/variables`) yangisiga redirect qilinadi.
2. **Konfiguratsiya ichki tablarga bo'lindi** — Uzum · MoySklad · Telegram ·
   Google Sheets · Qoldiq modifikatsiyasi. Har tab alohida komponent
   (`client/src/pages/config/`), umumiy yuklash mantiqi `common.jsx` da.
3. **Telegram spravochnigi** (`telegram_bot`, `telegram_chat`) — chat turi
   (shaxsiy/guruh/superguruh/mavzuli guruh/kanal) va mavzu ID bitta qatorda,
   faol/nofaol bayrog'i, "🔌 Tekshirish" (`getMe`). Eski panel katalogidagi
   yozuvlar ishga tushishda avtomatik ko'chadi (`importLegacyTelegram`).
4. **Integratsiyaga biriktirish** — `integration_telegram(integration_key,
   bot_id, chat_id)`. Kod `notify("uzum_stock", matn)` deb chaqiradi, chat va
   mavzu ID sini bilishi shart emas. Sozlanmagan bo'lsa xato emas,
   `{sent:false}` qaytadi — Telegram sababli qoldiq yuborish to'xtamasin.
5. **MoySklad tokeni** Konfiguratsiyada. Tartib: baza → `.env`. Ishga
   tushishda `.env` dagi qiymat bir marta bazaga ko'chadi. Token to'liq
   qaytarilmaydi — faqat niqoblangan ko'rinishi.
6. **Uzum buyurtmalari** bo'limi karkasi (ataylab bo'sh — 5-bosqichda to'ladi).

selfTest: 190 → **209** tekshiruv (Telegram katalogi, ko'chirish, biriktirish,
MoySklad tokeni).

### 2–3-bosqich — o'qish va qoldiq hisobi ✅ kod tayyor (2026-08-07)

Jadval tuzilmasi olindi (`dumpSheet.js`), formulalar kodga ko'chirildi.
Serverda **hech narsa yozilmaydi** — na Uzumga, na jadvalga.

* **Jadvallar** — `011_v3_stock.sql`: `mc_product`, `mc_stock`,
  `link_product`, `uzum_stock_mod`, `uzum_stock_mod_detail`,
  `uzum_mod_default`. Nomlar manbadagi listlar bilan bir xil.
* **MoySklad → baza** — [`moysklad/assortment.js`](../server/src/moysklad/assortment.js):
  assortiment (4 tur, sahifalab, upsert) va qoldiq (`report/stock/all/current`,
  ombor `config.json:moysklad.stockStoreId`, to'liq almashtiriladi).
  `IMPORTRANGE` va oraliq jadval kerak emas.
* **Hisoblash** — [`stock/rules.js`](../server/src/stock/rules.js): `link_product!L`
  va `!F` formulalarining **aynan** o'zi, toza funksiya sifatida. Sheets'ning
  ikkita xatti-harakati ataylab takrorlangan: `INT()` pastga yaxlitlaydi va
  `N` bo'sh bo'lsa natija 0 (manbada `#DIV/0!` → `IFERROR` → 0).
* **Jadvaldan ko'chirish** — [`stock/importFromSheet.js`](../server/src/stock/importFromSheet.js):
  `link_product` va qoidalar. `F`/`L` ustunlari ko'chirilmaydi — ular
  hisoblanadigan qiymat, manba emas.
* **Solishtirish** — [`scripts/v3Sync.js`](../server/src/scripts/v3Sync.js) server
  hisobini jadvaldagi bugungi qiymat bilan solishtiradi va farqni ko'rsatadi.
  Farq bo'lsa exit kodi 1.

selfTest: 209 → **236** (hisoblash mantiqi: standart qoida, priority, uchala
operator, `use_default`, bo'sh natija, kartochka miqdori).

#### Hisoblash qoidasi (o'zbekcha)

`L (haqiqiy qoldiq)` = MoySklad qoldig'i, `mc_product.external_id` bo'yicha
topiladi. MoySklad tovari biriktirilmagan yoki topilmasa — bo'sh (0 emas).

`F (Uzumga yuboriladigan son)`:

1. Qoldiq bo'sh yoki manfiy → **0**
2. Shu SKU uchun `uzum_stock_mod` qoidasi bormi — `priority` kichigidan
   boshlab birinchi mos kelgani olinadi (`greater than` / `less than` / `equal`)
3. Qoida natijasi **bo'sh** bo'lsa — haqiqiy qoldiq qoladi. Bugungi
   ma'lumotda aynan shu ishlatilgan: "999999 dan kam" + bo'sh natija =
   "bu tovarga standart qoida tegmasin"
4. Qoida yo'q/mos kelmasa — `uzum_mod_default` (hozir bitta: **10 dan kam → 0**)
5. Natija `card_quantity` ga bo'linadi: kartochkada 3 ta tovar bo'lsa,
   MoySkladdagi 100 dona → Uzumga **33**

> **Eski `@N` / `$` qo'shimchasi.** `K` ustunidagi qiymat oxirida `@3` kabi
> qo'shimcha bo'lsa, u ham bo'luvchi edi. Yangi tizimda bunday qo'shimcha
> **bo'lmaydi** — External ID kiritilganda UUID `mc_product` dan darhol
> topiladi, topilmasa xato ko'rsatiladi. Ko'chirilgan qatorlarda qo'shimcha
> `link_product.legacy_divisor` ga ajratib olinadi (shundagina server bugungi
> son bilan bir xil natija beradi) va import hisobotida ro'yxat qilinadi —
> ular tozalanishi kerak.

### 4-bosqich — yozish ⏳ kod tayyor, sinov kutilmoqda (2026-08-07)

Ikkala yozuv oqimi serverga ko'chdi. **Ikkalasi ham standart holatda hech
narsa yozmaydi** — yozish faqat ataylab berilgan bayroq bilan. Sababi
oddiy: bu oqimlar tashqi natijaga olib keladi (Uzumda tovar sotuvdan
chiqishi, MoySklad'da barcode o'zgarishi), shuning uchun "tasodifan ishga
tushib ketdi" degan holat bo'lmasligi kerak.

#### Uzumga qoldiq yuborish

[`stock/pushToUzum.js`](../server/src/stock/pushToUzum.js) — v3 dagi
`pushToUzumFast` ning o'rni. Payload shakli **aynan bir xil**
(`skuId · skuTitle · productTitle · barcode · amount · fbsLinked · dbsLinked`),
100 talik batch, 4 parallel to'lqin, 429/5xx da eksponensial backoff.

```bash
node src/scripts/pushStock.js                    # DRY-RUN
node src/scripts/pushStock.js --send --shop=682 --limit=20   # ehtiyotkor sinov
node src/scripts/pushStock.js --send             # to'liq
```

GAS'dan ikki farqi:

* qoldiq jadvaldagi formuladan emas, `stock/rules.js` dan hisoblanadi;
* token har qatorda takrorlanmaydi (`link_product!G`) — do'kon orqali
  kabinetdan olinadi, ya'ni bitta joyda turadi.

**Bitta xatti-harakat farqi bor va u ataylab:** do'kon darajasidagi
`uzum_shop!E` ("Stock update") bayrog'i hisobga olinadi. GAS bu ustundan
foydalanmagan. Dry-run hisobotida shu sababli o'tkazib yuborilgan qatorlar
**alohida ko'rsatiladi** — sinovdan oldin ko'zdan kechirish kerak.

#### Barcode → MoySklad

[`stock/barcodeToMc.js`](../server/src/stock/barcodeToMc.js) — v3 dagi
`addBarcodesToMoySklad`. Eng muhim qoida saqlangan: PUT'dan oldin tovarning
hozirgi barcode'lari MoySklad'dan **jonli** o'qiladi va yangisi ularning
ustiga qo'shiladi, shuning uchun eski barcode'lar yo'qolmaydi.

```bash
node src/scripts/barcodeSync.js                        # DRY-RUN
node src/scripts/barcodeSync.js --write --keep-sheet-flag   # GAS yoqiq turganda
node src/scripts/barcodeSync.js --write                # to'liq
```

Bayroq `link_product!H` da; qabul qilinadigan qiymatlar v3 dagidek
(`TRUE`/`yes`/`ha`/`1`/`x`/`✓`/`yubor`). Muvaffaqiyatli qatorda bayroq
tozalanadi — **jadvalda ham**, aks holda ish takrorlanardi. Jadvaldagi qator
raqami bazada saqlanmaydi: har yozishdan oldin `skuTitle` bo'yicha joriy
qator topiladi (AppSheet qatorlarni surishi mumkin), so'ng hammasi bitta
`batchUpdate` bilan yoziladi.

`--keep-sheet-flag` — MoySklad'ga yozadi, jadvaldagi bayroqqa tegmaydi. GAS
trigger'i hali yoqiq turganda sinash uchun: server ishni bajaradi, GAS keyin
"allaqachon bor" deb ko'radi va bayroqni o'zi tozalaydi. Takror barcode
qo'shilmaydi, chunki mavjudligi qiymat bo'yicha tekshiriladi.

#### ⚠ 2026-08-07: 20 ta SKU Uzumda nolga tushdi

`013` migratsiyasi `mc_stock` ni `DROP TABLE` qilib qaytadan yaratdi va
uni to'ldiradigan hech narsa ishlamadi. `pushStock.js` bo'sh keshdan
o'qib har qatorga `amount = 0` hisobladi. Hisobotda "3740/3740 nol" deb
turgan edi, lekin skript baribir yubordi.

Xulosa: **ogohlantirishni matnga yozish yetarli emas, kodga qo'yish
kerak.** Endi yuborishdan oldin uchta shart tekshiriladi va har biri
o'zi yetarli sabab:

| Shart | Chegara |
|---|---|
| `mc_stock` bo'sh | — |
| `mc_stock` eskirgan | 6 soat |
| SKU'larning ko'pi nol bilan ketadi | 50% |

Tekshiruv `stock/runner.js` da — **skript, interfeys va jadval ham aynan
shu yo'ldan o'tadi**. Ilgari himoya faqat skriptda bo'lgani uchun
interfeysdan yoki jadval bo'yicha yuborilganda ishlamay qolardi.

To'xtatilgan ishga tushish `error` emas, **`blocked`** deb yoziladi:
tizim xato qilmadi, ataylab hech narsa yubormadi. Chetlab o'tish faqat
ataylab — CLI'da `--ignore-safety-checks`, interfeysda esa faqat
superadmin.

#### Interfeys (2026-08-07)

Oqimlarni boshqarish uchun SSH shart emas:

* **Integratsiyalar → "Qoldiq oqimlari"** — uchta oqim uchun holat, qo'lda
  ishga tushirish (sinov / haqiqiy), jadval sozlamasi va ishga tushishlar
  tarixi. Birinchi kartada qoldiq keshining holati: `mc_stock` bo'sh bo'lsa
  qizil bilan ko'rinadi.
  * "Haqiqatan yuborish" **ikki qadamli** — tasdiqlash so'raladi.
  * Jadval bo'yicha ishlash standart holatda **o'chirilgan**: yangilanishdan
    keyin server o'z-o'zidan Uzumga yozib yubormaydi. Yoqish interfeysdan.
  * Interval 5–1440 daqiqa (MoySklad va Uzum tezlik cheklovi bor).
* **Tovar bog'lamalari** (yangi bo'lim, `link_product` ruxsati) — jadvalning
  nusxasi emas: har qatorda **hisoblangan** qiymatlar ham ko'rinadi —
  MoySklad qoldig'i va Uzumga ketadigan son. "Nega bu tovarga 0 ketdi"
  degan savolga shu yerda javob topiladi. External ID va kartochka miqdorini
  tahrirlash mumkin; External ID kiritilganda UUID `mc_product` dan darhol
  topiladi va **topilmasa xato qaytadi** (v3 dagi `@N` qo'shimchalari
  o'rniga qabul qilingan tartib).

`stock_runs` jadvali (`016`) har ishga tushishni yozadi: kim, qaysi manba
(qo'lda / jadval / skript), holat va tafsilotlar.

#### Ko'chirish tartibi

| # | Qadam |
|---|---|
| 1 | `pushStock.js` (dry-run) — GAS yuborayotgan son bilan solishtirish |
| 2 | `pushStock.js --send --shop=<id> --limit=20` — bitta do'konda sinash |
| 3 | Uzum kabinetida qoldiq to'g'ri o'zgarganini ko'rish |
| 4 | GAS'da `pushToUzumFast` trigger'ini **o'chirish** |
| 5 | `pushStock.js --send` — to'liq |
| 6 | Xuddi shu tartib `barcodeSync.js` uchun |
| 7 | Ikkalasi bir necha kun barqaror ishlagach — GAS kodlarini o'chirish |

> 4-qadamgacha GAS ham yozib turadi. Natija bir xil bo'lgani uchun bu
> xavfli emas, lekin so'rovlar ikki barobar bo'ladi.

Xato bo'lganda Telegram'ga xabar ketadi (Konfiguratsiya → Telegram →
"Uzumga qoldiq yuborish" va "Barcode → MoySklad" integratsiyalari).

selfTest: 270 → **305** (payload yasash, guruhlash, bayroqlar, chegaralar,
barcode turi va GTIN nazorat raqami).

### 5-bosqich — Uzum buyurtmalari

Server Uzum API'dan buyurtmalarni tortadi (hozir `uzum-order-to-mc` va
`orders` keshi qiladigan ish), Google Sheets zaxira nusxa bo'lib qoladi.

## Buyruqlar

Jadval tuzilmasini qayta o'qish (natija `docs/v3-sheet-structure.json`,
tokenlar niqoblanadi):

```bash
cd /root/stocker/server && node src/scripts/dumpSheet.js
```

Ko'chirish va solishtirish:

```bash
cd /root/stocker/server && node src/scripts/v3Sync.js
```

`--skip-moysklad` — MoySklad'ga tegmay faqat jadvaldan ko'chiradi.
`--compare` — hech narsa yozmay, faqat solishtiradi.

## Ko'chirilmaydigan listlar

| List | Sabab |
|---|---|
| `link_product.G` (Company/token) | Token `shop_id` → `uzum_shops` → `uzum_cabinets` orqali topiladi. Ustun GAS'ni yengillashtirish uchun qo'yilgan edi |
| `uzum_generated` · `uzum_merged` · `link_check` · `mc_errors` | v3 bilan qoladi |
| `user.Role` | Huquq `user_permissions` orqali beriladi — ikkinchi mexanizm kerak emas |
| `user.Telegram ID` | ✅ ko'chdi: `users.telegram_id` (`012_user_telegram.sql`), Foydalanuvchilar bo'limida tahrirlanadi |
| `mc_token` | ✅ ko'chdi: Konfiguratsiya → MoySklad |
| `uzum_shop` · `uzum_token` | ✅ o'rni bor: Konfiguratsiya → Uzum |

## MoySklad qoldiq hisoboti ishonchsiz

`report/stock/all/current` ketma-ket chaqirilganda har xil son qaytaradi
(3000 → 2997 → 2998 → 3000). Yo'qolgan tovarlar tekshirilganda boshqa
omborga o'tmagan va qoldig'i nolga tushmagan — bu API tomonidagi
nomuvofiqlik.

**Nega xavfli:** tovar bitta javobda ko'rinmasa, biz uni "qoldiq yo'q" deb
Uzumga **0** yuborardik — sotuvdagi tovar do'kondan yo'qolardi.

**Butun katalogni** tovar kesimida so'rash API xarajatini oshirib yuboradi,
lekin **tushib qolgan 1-3 ta tovarni** alohida so'rash arzon. Shuning uchun
uch qavat himoya ([`moysklad/assortment.js`](../server/src/moysklad/assortment.js)):

1. **Butun javob rad etilishi mumkin.** Qatorlar soni oldingisidan
   `stockMinResponseRatio` (0.95) dan ko'proq kamaysa, hisobot umuman
   qo'llanmaydi va logga xato yoziladi. Bir necha tovar tushib qolishi
   normal, ommaviy kamayish — nosozlik.
2. **Maqsadli qayta so'rov.** Hisobotda ko'rinmagan tovarlar `filter=
   assortmentId=…` bilan alohida so'raladi — bittalab emas,
   `stockRecheckBatch` (50) tacha birga, ya'ni odatda **qo'shimcha bitta
   so'rov**. Javob kelsa (0 ham javob) qoldiq darhol aniqlanadi va kutish
   kerak bo'lmaydi. `stockRecheckMax` (200) dan ko'p bo'lsa o'tkazib
   yuboriladi — bu allaqachon nosozlik belgisi.
3. **Kutish (zaxira).** Maqsadli so'rov ham topmasa yoki xato bersa,
   tovarning oxirgi ma'lum qoldig'i saqlanadi va `missing_count` oshadi; u
   ketma-ket `stockMissingConfirmations` (3) marta kelmagandagina 0 deb
   belgilanadi. Qaytib kelsa hisob nollanadi.

Nega uchinchi qavat kerak: agar nomuvofiqlik MoySklad tomonidagi keshdan
bo'lsa, maqsadli so'rov ham o'sha noto'g'ri javobni qaytarishi mumkin. Buni
o'lchash uchun diagnostika bor:

```bash
cd /root/stocker/server && node src/scripts/stockProbe.js
```

Skript hisobotni bir necha marta so'raydi, beqaror tovarlarni ajratadi, so'ng
ularni maqsadli so'rov bilan **ikki marta** so'rab, maqsadli so'rovning o'zi
barqarormi degan savolga javob beradi. Yon tekshiruv sifatida
`stockMode=all` ham sinaladi — u nol qoldiqlarni qaytarsa, "tushib qolish"
o'rniga 0 ko'rinadi va muammo ildizidan yopiladi.

> **2026-08-07 dagi natija:** 4 marta ketma-ket so'rovda hammasi 2142 ta,
> nomuvofiqlik **takrorlanmadi**. Bir martalik sinov "muammo yo'q" degan
> xulosa uchun asos bo'lmaydi — muammo kuzatilgan, demak u vaqti-vaqti bilan
> chiqadi. Shuning uchun doimiy kuzatuv qo'shildi (pastda).

Barcha chegaralar `config.json` → `moysklad` da.

### Doimiy kuzatuv

Har sinxronizatsiya `mc_stock_sync_log` ga yoziladi (90 kun saqlanadi):
hisobotda nechta tovar kelgani, nechtasi tushib qolgani, maqsadli so'rov
nechtasini tiklagani va oxir-oqibat nechtasi 0 deb belgilangani.

```bash
cd /root/stocker/server && node src/scripts/stockLog.js
```

Skript oxirida xulosa chiqaradi va `stockMissingConfirmations` ni
pasaytirish xavfsizmi degan savolga **dalil bilan** javob beradi: agar
tushib qolgan tovarlarning hammasini har safar maqsadli so'rov hal qilgan
bo'lsa, kutish rejimi amalda ishlamayapti va uni qisqartirsa bo'ladi.

Diqqat talab qiladigan holatda **Telegram'ga xabar** ketadi (Konfiguratsiya →
Telegram → "Uzumga qoldiq yuborish" integratsiyasi): hisobot rad etilganda,
tovar 0 deb belgilanganda yoki maqsadli so'rov xato berganda. Har
sinxronizatsiyada emas — aks holda xabar shovqinga aylanib o'qilmay qoladi.

### `stockMissingConfirmations` nima degani

Tovar **necha marta ketma-ket** hisobotda ko'rinmasa, qoldig'i 0 deb
belgilanadi. Hozir `3`:

| Sinxronizatsiya | Natija |
|---|---|
| 1-chi da yo'q | oxirgi ma'lum qoldiq saqlanadi (`missing_count = 1`) |
| 2-chi da yo'q | yana saqlanadi (`missing_count = 2`) |
| 3-chi da yo'q | **0 deb belgilanadi**, Uzumga 0 ketadi |

Katta son — noto'g'ri nol yuborish xavfi kam, lekin tovar haqiqatan
tugaganda Uzumda uzoq "bor" bo'lib turadi (sotib bo'lmaydigan buyurtma
tushishi mumkin). Kichik son — teskarisi.

Son **tsiklda** o'lchanadi, daqiqada emas. `syncStock` hozircha faqat qo'lda
ishga tushadi, jadval bo'yicha ishlashi 4-bosqichda qo'shiladi — interval
belgilangandan keyin bu qiymat qayta ko'rib chiqiladi.

## MoySklad havolalari (MC href)

v3 dagi `uzum_shop!G` va `uzum_token!D` ustunlari buyurtmani MoySklad'ga
yozishda ishlatiladi:

| v3 | Ma'nosi | Yangi joyi |
|---|---|---|
| `uzum_token!D` | yuridik shaxs (`organization_href`) | `uzum_cabinets.mc_organization_href` |
| `uzum_shop!G` | sotuv kanali (`saleschannel_href`) | `uzum_shops.mc_saleschannel_href` |
| `uzum_shop!F` | SKU prefiksi (UZON, BUYO…) | `uzum_shops.sku_code` |
| `uzum_shop!E` | do'kon bo'yicha qoldiq yangilash | `uzum_shops.stock_update` |

`v3Sync.js` ularni jadvaldan o'qib to'ldiradi va Konfiguratsiya → Uzum da
tahrirlash mumkin. Do'kon yoki kabinet **yaratilmaydi** — ular Uzum API'dan
keladi; jadval faqat MoySklad'dagi juftini biladi.

## Solishtirish natijasi (2026-08-07)

Birinchi yurgizishda 3764 qatordan **5 tasida** `amount` farq qildi. Hammasi
bir xil sababdan: server MoySklad'dan yangi qoldiq oldi, jadvaldagi qiymat esa
oxirgi `MSStockSync` dan qolgan (440 ↔ 442, 35 ↔ 36, 1 ↔ 2, va jadvalda hali
yo'q tovarlar).

Buni taxminda qoldirmaslik uchun `--stock-from-sheet` bayrog'i qo'shildi:
qoldiq ham jadvaldan olinadi, ya'ni ikkala tomon **bir xil** raqamdan
hisoblaydi.

```bash
cd /root/stocker/server && node src/scripts/v3Sync.js --stock-from-sheet
```

Natija: **`L` farqi 0, `F` farqi 0** — 3764 qatorning hammasida. Ya'ni
formulalar to'g'ri ko'chgan va oldingi 5 ta farq faqat qoldiq
eskirganidan edi.

Import 9 ta qatorda `K` ustunida eski `@N` / `$` qo'shimchasi qolganini
ko'rsatdi; ular **2026-08-07 da tozalandi**.
