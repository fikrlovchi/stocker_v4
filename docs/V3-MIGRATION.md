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
| `link_product` | — | **Tovar bog'lamalari** (yangi, qo'shish formasi bilan) |
| — | — | "Barcode va SKU jurnali" — **Integratsiyalar** ichidagi varaq |
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

Qoldiq yuborishni **faqat `link_product!J`** boshqaradi. Do'kon
darajasidagi `uzum_shop!E` ("Stock update") eski mantiqning qoldig'i edi —
ustun ham, interfeysdagi belgi ham olib tashlandi (`017`).

#### Barcode va SKU — jadval bilan EMAS, qator qo'shilganda

v3 da bu ikki amal AppSheet automation'i orqali, `link_product` ga yangi
qator qo'shilganda ishlardi (`runAll`: `fetchUzumProducts` +
`addBarcodesToMoySklad`). Shu xatti-harakat saqlanadi — ular jadval
bo'yicha takrorlanadigan ish EMAS.

"Tovar bog'lamalari" bo'limida yangi SKU qo'shilganda server ketma-ket:

1. External ID → UUID (`mc_product` dan). **Topilmasa qator umuman
   yaratilmaydi** — aks holda katalogda "yarim" qator qolib, qoldiq
   hisobida jim ravishda 0 berardi.
2. Uzum'dan SKU ma'lumoti: `skuId`, tovar nomi, barcode, rasm.
   Qidiruv kaliti `skuTitle` va u Uzum javobidagi `skuFullTitle` bilan
   **aynan** mos kelishi shart.
3. Barcode → MoySklad (mavjudlar ustiga qo'shiladi).

2- yoki 3-qadam yiqilsa **qator saqlanib qoladi** (masalan Uzum javob
bermasa) va jadvalda "Qayta urinish" tugmasi paydo bo'ladi.

Natija **Integratsiyalar → "Barcode va SKU jurnali"** varag'ida
(`link_product_events`):
qaysi SKU, qaysi amal, holat va sabab. Bu bo'limda "ishga tushirish"
tugmasi yo'q — ishga tushiradigan narsa qator qo'shilishi.

Ko'chish davrida jadvalda bayroq (`link_product!H`) qolgan qatorlar uchun
`barcodeSync.js` skripti qoladi.

#### Qo'shish formasi

Maydonlar v3 dagi AppSheet formasi bilan bir xil: `skuTitle` ·
`MC External ID` · Do'kon · Kartochkadagi miqdor · Qoldiqni yangilash? ·
Order import.

Do'kon **o'zi tanlanadi** — v3 dagi "initial value" formulasining aynan
o'zi:

```
LOOKUP(INDEX(SPLIT(TRIM([skuTitle]), "-"), 1), "uzum_shop", "SKU code", "ID")
```

`-` gacha bo'lgan birinchi bo'lak `SKU code` bilan **aynan** solishtiriladi.
"Shu bilan boshlanadi" degan moslik emas: `UZONX-1` uchun `UZON` kodi mos
kelmasligi kerak, aks holda tovar boshqa do'konga biriktirilardi.

#### Barcode → MoySklad (mantiq)

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

### 5-bosqich — yig'ilishi kerak buyurtmalar ✅ (2026-08-08)

Ilgari qaysi buyurtmalar yig'ilishini **admin** belgilardi: partiyaga ID
ro'yxati joylanardi. Bu ortiqcha qadam edi — "yig'ilishi kerak" degan holat
allaqachon ma'lum.

**Yig'ish → "Yig'ilishi kerak"** varag'i endi ro'yxatni o'zi chiqaradi:
`eligible = 1`, ochiq/tugagan sessiyasi yo'q, bekor qilinmagan va
`uzum_packing` da yo'q. Guruh → do'kon kesimida yig'ma jadval ham bor.

**"Buyurtma ID'lari" maydoni qoldi** — endi u solishtirish quroli
([`packing/pending.js`](../server/src/packing/pending.js)). Qo'lda tuzilgan
ro'yxatni joylasangiz uch xil natija chiqadi, har biri boshqa harakat
talab qiladi:

| Natija | Ma'nosi |
|---|---|
| **mos keldi** | ro'yxatda ham bor, yig'ilishi ham kerak |
| **ortiqcha** | ro'yxatda bor, lekin yig'ish kerak emas — **sababi bilan** (yig'ilgan · bekor qilingan · hozir yig'ilmoqda · keshda yo'q · yig'ishga chiqmaydi) |
| **kirmagan** | yig'ilishi kerak, lekin ro'yxatga tushmagan |

Sabab ko'rsatilishi muhim: "bu ID nega ortiqcha" degan savolga javob
bo'lmasa operator nima qilishini bilmaydi.

Guruhsiz do'konlar ro'yxatda **qizil** bilan ko'rinadi — bu sozlash kerak
bo'lgan holat, jim o'tmasligi kerak.

selfTest: 389 → **406**.

### 6-bosqich — Uzum buyurtmalari serverga ⏳

Server Uzum API'dan buyurtmalarni tortadi (hozir `uzum-order-to-mc` va
`orders` keshi qiladigan ish), Google Sheets zaxira nusxa bo'lib qoladi.

**2026-08-08 da kelishildi.** Quyidagilar qaror, taxmin emas.

#### Status — hisoblanadi, saqlanmaydi

"Holat" o'rniga **Status**. Qiymat hech qayerda saqlanmaydi: har safar mavjud
ma'lumotdan chiqariladi (hold oynasi · MoySklad holati · Uzum bekor bayrog'i ·
`canceluzum` belgisi). Ikkinchi haqiqat manbai bo'lmaydi — aks holda "bazada
bir xil, MoySkladda boshqa" degan holat paydo bo'lardi.

Ilova ikki tilli, shuning uchun status **kalit** sifatida saqlanadi va ekranda
tarjima qilinadi (`client/src/i18n.js`):

| Kalit | uz | ru | Qachon |
|---|---|---|---|
| `new` | Yangi | Новый | buyurtma **kutish oynasida tushgan** va hali 11:01 ishlovidan o'tmagan |
| `packing` | Yig'ilmoqda | Комплектуется | oynadan tashqarida tushgan yoki oyna tugagach tasdiqlangan |
| `packed` | Yig'ildi | Собран | dasturda yig'ib bo'lingan (`uzum_packing` / tugagan sessiya) |
| `auto_canceled` | Avtomatik bekor bo'ldi | Отменён автоматически | oynada tushgan buyurtma 11:01 dagi ishlovda Uzum'da `CANCELED` bo'lib chiqdi → MoySklad'da bekor + bildirishnoma (hozirgi xatti-harakat) |
| `cancel_pending` | Bekor qilinishi kutilmoqda | Ожидает отмены | tasdiqlangandan keyin Uzum'da bekor bo'lgan — MoySklad'da **qo'lda** bekor qilish kerak |
| `build_error` | Yig'ish xatosi | Ошибка сборки | MoySklad'da `Ошибка сборки` ga o'tkazilgan → `/canceluzum` → Uzum'da bekor qilinadi |
| `canceled` | Bekor qilindi | Отменён | MoySklad'da `Отменен` ga o'tkazilgan → `/mccanceled` |

Diqqat: `new` sharti **buyurtma tushgan vaqt** bo'yicha (`uzum_order!W`), joriy
soat bo'yicha emas. Oynada tushgan buyurtma 11:01 dagi ishlovgacha `Yangi`
bo'lib turadi.

`Yig'ildi` hozircha **faqat dasturda** — MoySklad holati sinovdan keyin
o'zgartiriladi (9-faza: "Собран" + Telegram).

Vaqt oynasi hozirgi `uzum-order-to-mc` dagidek: `WINDOW_HOLD_START` (06:10) …
`WINDOW_HOLD_END` (11:00), Toshkent vaqti, `isInHoldWindow` — yarim ochiq
oraliq `[start, end)`. **Mantiq o'zgarmaydi** — Uzum javobidan "bekor qilingan
vaqt" izlanmaydi.

Oraliqni endi **interfeysdan** o'zgartirish mumkin ✅ (2026-08-08):
Integratsiyalar → `uzum-order-to-mc` → "Kutish oynasi (Toshkent vaqti)".
`PUT /web/projects/:slug/hold-window` `.env` dagi `WINDOW_HOLD_START` /
`WINDOW_HOLD_END` satrlarini almashtiradi (qolgan satrlarga tegmaydi, yozish
`tmp` + `rename` orqali — faylda tokenlar bor). Servis timer bilan ishlagani
uchun **restart shart emas**: keyingi tsiklda `.env` qaytadan o'qiladi.
Tugash vaqti boshlanishdan katta bo'lishi tekshiriladi — aks holda
`isInHoldWindow` har tsiklda yiqilardi.

#### MoySklad → Stocker: IKKITA endpoint

MoySklad webhook'i **qaysi holatga o'tganini yubormaydi** — faqat "shu
buyurtma o'zgardi" deydi. Bitta endpoint bo'lsa, har chaqiruvda MoySklad'dan
buyurtma holatini qayta so'rash kerak bo'lardi. Shuning uchun **har holat
uchun alohida manzil**: MoySklad tomonda ikkita webhook/ssenariy, manzilning
o'zi ma'noni bildiradi va qo'shimcha so'rov umuman kerak emas.

| Endpoint | MoySklad'dagi holat | Nima qiladi |
|---|---|---|
| `stocker.uz/canceluzum` | `Ошибка сборки` | **Uzum'da bekor qiladi** → status `Yig'ish xatosi` → Telegram |
| `stocker.uz/mccanceled` | `Отменен` | status `Bekor qilindi`. Uzum'ga ham, MoySklad'ga ham **hech qanday so'rov yubormaydi** — buyurtma Uzum'da allaqachon bekor (`Bekor qilinishi kutilmoqda`) |

`/canceluzum` bugungi `uzum-order-to-mc/src/mcCancelServer.js` (pm2, port 4042,
`/mc-cancel`) ning o'rnini bosadi: farqi — qatorni `uzum_order!S` dan emas,
server bazasidan (`orders.moysklad_id`) topadi va Uzum tokenini
`uzum_shops` → `uzum_cabinets` dan oladi. Ikkalasi bir muddat yonma-yon
ishlaydi, so'ng `mc-cancel` o'chiriladi.

**Status baribir saqlanmaydi.** Bu ikki endpoint faqat *tashqi faktni* yozadi
(kim, qachon, qaysi UUID) — `order_marks` kabi jadvalga. Status o'sha
belgidan hisoblanadi, xuddi Uzum bekor bayrog'i va hold oynasi kabi. Aks
holda ikkinchi haqiqat manbai paydo bo'lardi.

#### Endpoint himoyasi

MoySklad webhook'iga **maxsus sarlavha yoki imzo qo'shib bo'lmaydi** —
hujjatlangan maydonlar faqat `url` · `action` · `entityType` · `diffType`
(`dev.moysklad.ru`, `POST /notification/webhook`). Chiquvchi so'rovlar uchun
sobit IP diapazoni ham e'lon qilinmagan.

Amaliy yechim — **maxfiy qism manzilning o'zida**:

```
https://stocker.uz/canceluzum/<uzun-tasodifiy-token>
https://stocker.uz/mccanceled/<uzun-tasodifiy-token>
```

HTTPS'da manzil yo'li tarmoqda ko'rinmaydi. Yagona nozik joyi — nginx
`access_log`: shu ikki `location` uchun log o'chiriladi yoki token
niqoblanadi.

Bundan tashqari, ikkalasi ham:

* faqat **bazada mavjud** `moysklad_id` ni qabul qiladi — noma'lum UUID hech
  narsa qilmaydi;
* allaqachon bekor qilingan buyurtmani qayta ishlamaydi (idempotent);
* har chaqiruv `stock_runs` uslubida yoziladi va Telegram'ga xabar ketadi —
  suiiste'mol jim o'tmaydi.

`/canceluzum` xavfliroq (Uzum'da haqiqiy bekor qilish), `/mccanceled` esa faqat
belgi qo'yadi.

#### Uzum'da bekor bo'lganini kim aniqlaydi

`cancelUzumOrder` sweep'i **qaytarilmaydi**. Bu ma'lumot allaqachon
`uzum-order-to-mc` da bor va u shartlar asosida bildirishnoma yuborib,
MoySklad'da bekor qiladi:

* [`orderStatusSync.promoteHeldOrders`](../uzum-order-to-mc/src/orderStatusSync.js) —
  oyna tugagach Uzum holatini so'raydi, `CANCELED` bo'lsa tasdiqlamaydi;
* `handleConfirmFailure` — tasdiqlashdan oldin bekor bo'lgan holat;
* [`cancelSync`](../uzum-order-to-mc/src/cancelSync.js) — 24 soatlik monitoring.

Status shu manbadan oziqlanadi. **Diqqat:** `uzum_order!V` "bekor qilingan"
degani emas (`cancelSync.js:148` bekor qilinmaganga ham 24 soatdan keyin `V=1`
qo'yadi) — bekor qilinganlik MoySklad holatidan aniqlanadi.

#### Mobil ilova

Status ro'yxati **kerak emas**. Ilova faqat **ochiq** buyurtmalar bilan
ishlaydi: skanerlangan tovar ochiq buyurtmalar tarkibida bo'lmasa —
"Buyurtma topilmadi". Bugungi `scan/sessions.js` shu tartibda ishlaydi
(`unknown_barcode` · `no_available_order` · `other_shop`), sarlavha matni
shu qarorga moslanadi.

#### Ko'chish tartibi (2-savolning javobi)

| # | Qadam |
|---|---|
| 1 | **Formulali kataklar to'g'ri ko'chganini tekshirish** ✅ kod tayyor — `orderSync.js` |
| 2 | Farq 0 bo'lgach — buyurtmalarni Uzum API'dan to'g'ridan-to'g'ri tortish |
| 3 | So'ng Sheets bilan aloqa **bosqichma-bosqich** uziladi: har bosqichda bitta yozuv oqimi o'chadi va natija eski qiymat bilan solishtiriladi |
| 4 | `mcCancelServer` → `stocker.uz/canceluzum` |
| 5 | Migratsiya `uzum_order` ning **hammasini** oladi (~8200 qator) |

#### Hisoblanadigan kataklar — jadvaldagi formula va serverdagi o'rni

Formulalar `dumpSheet.js` bilan olindi (2026-08-08) va
[`orders/formulas.js`](../server/src/orders/formulas.js) ga **toza funksiya**
sifatida ko'chirildi:

| Katak | Jadvaldagi mantiq | Serverdagi manba |
|---|---|---|
| `uzum_order!O` | `XLOOKUP(XLOOKUP(G, uzum_shop!A, uzum_shop!D), uzum_token!C, uzum_token!D)` | `uzum_cabinets.mc_organization_href` |
| `uzum_order!P` | `XLOOKUP(G, uzum_shop!A, uzum_shop!G)` | `uzum_shops.mc_saleschannel_href` |
| `uzum_order!R` | `"10-" & TEXT(A, "0000000000") & "-1"` | spravochnik kerak emas — faqat buyurtma ID sidan |
| `uzum_order_detail!I` | `skuTitle → link_product!K` (qo'shimcha kesiladi) `→ mc_product!F → mc_product!B` | `link_product.mc_external_id → mc_product.external_id → uuid` |
| `uzum_order_detail!J` | `XLOOKUP(I, mc_product!B, mc_product!C)` | `mc_product.entity_type` |
| `uzum_order_detail!K` | `F × XLOOKUP(C, link_product!B, link_product!N)` | `amount × link_product.card_quantity` |
| `uzum_order_detail!L` | `IF(F=K, FALSE, TRUE)` | `uzumOrderToMC` buni `priceIsTotal` deb o'qiydi (`index.js:66`) |

`R` ning shakli muhim: **hech qanday tashqi manbaga bog'liq emas**, ya'ni
buyurtma Uzum API'dan kelishi bilan tracking raqami ma'lum bo'ladi.

#### ⚠ `O` va `P` — buyurtma bilan MUZLATILADI

Do'konlar vaqti-vaqti bilan boshqa kabinetga o'tkaziladi (`uzon.market`
ИП SHINGARYOVA dan ИП Софья Кокчан ga ko'chgan). Kabinet — MoySklad'dagi
**yuridik shaxs**, ya'ni ko'chishdan keyin buyurtma **boshqa firma** nomida
yaratiladi.

Shundan kelib chiqadigan qoida:

> `organization_href` va `saleschannel_href` buyurtma **yaratilayotgan
> paytda** hisoblanadi va buyurtma bilan birga **saqlanadi**. Keyin qayta
> hisoblanmaydi.

Jadvaldagi `ARRAYFORMULA` bu qoidani buzadi: u butun ustunni **bugungi**
spravochnik bo'yicha qayta hisoblaydi, ya'ni 2024-yilgi buyurtma ham
bugungi firmani ko'rsatib turadi. Xato ko'rinmay turadi — do'kon ko'chmaguncha.

Amaliy natijasi:

* **migratsiyada** `O` va `P` jadvaldan **ko'chiriladi**, qayta hisoblanmaydi;
* **yangi** buyurtmalar uchun bugungi kabinet ishlatiladi;
* `orderSync.js` dagi 224 ta farq (`do'kon 682`) aynan shundan — bu **xato
  emas**, ikki tomon ikki xil vaqtdagi holatni ko'rsatmoqda.

#### Do'kon ko'chishi ✅ (2026-08-08)

Ko'chish endi jim o'tmaydi:

* **`019_shop_moves.sql`** — `uzum_shop_moves` tarixi (qaysi do'kon, qaysi
  kabinetdan qaysisiga, qachon) va `uzum_shops(shop_id)` bo'yicha **yagona**
  indeks. Ilgari yagonalik `(cabinet_id, shop_id)` juftligida edi, ya'ni
  ko'chgan do'kon eski kabinetda ham qolib ketardi va `organization_href`
  ikkitasidan tasodifiy birini olardi. Migratsiya mavjud takrorlarni
  tozalaydi (eng oxirgi qator qoladi).
* **`applyShops`** ([`web/variables.js`](../server/src/web/variables.js)) —
  sinxronizatsiya uchta holatni ajratadi: yangi · ko'chgan · o'zgarmagan.
  Ko'chganda qator **ko'chiriladi**, tarixga yoziladi va logga chiqadi.
  Do'konning `mc_saleschannel_href` i saqlanadi (u do'konniki), yuridik shaxs
  esa kabinet bilan o'zgaradi.
* **Konfiguratsiya → Uzum** da "Do'kon ko'chishlari" kartasi — ko'chish
  bo'lmasa chizilmaydi.
* **`orderSync.js`** farq chiqqanda ikkala yuridik shaxsning nomini
  MoySklad'dan so'raydi va ko'chish tarixini ko'rsatadi.

##### Ko'chirish tartibi (amaliyot)

| # | Qadam | Qayerda |
|---|---|---|
| 1 | Uzum'ga ariza yuboriladi; do'konni **Uzum o'zi** ko'chiradi (ma'lum vaqt ichida) | Uzum |
| 2 | Qabul qiluvchi kabinetda **yangi API kalit** yaratiladi va unga **barcha do'konlar** belgilanadi | Uzum kabineti |
| 3 | Yangi kalit Stocker'ga qo'yiladi | Konfiguratsiya → Uzum → kabinet → **API kalit** |
| 4 | **"Do'konlarni yangilash"** bosiladi — do'kon ko'chgani aniqlanadi va tarixga yoziladi | Konfiguratsiya → Uzum |

3-qadam **majburiy**: ko'chishdan keyin eski kalit yangi do'konni ko'rmaydi,
ya'ni "Yangilash" hech narsa topmaydi. Ilgari kalitni faqat SSH orqali
bazadan almashtirish mumkin edi — endi kabinet kartasidan. Saqlangan kalit
hech qachon qaytarilmaydi, maydon bo'sh qoldirilsa eskisi o'z joyida qoladi.

Ko'chishdan keyin **yuridik shaxsni tekshiring**: `organization_href` kabinetga
bog'langan, ya'ni do'kon yangi kabinetning firmasiga o'tadi. Agar u firma
MoySklad'da boshqacha bo'lsa — kabinet kartasidagi "MoySklad yuridik shaxsi"
ni tuzatish kerak, aks holda yangi buyurtmalar noto'g'ri firmada yaratiladi.

Solishtirish (hech narsa yozmaydi, farq bo'lsa exit kodi 1):

```bash
cd /root/stocker/server && node src/scripts/orderSync.js
```

```bash
cd /root/stocker/server && node src/scripts/orderSync.js --limit=500 --samples=20
```

Hisobotda uch xil natija **ataylab** ajratilgan: `mos` · `bog'lanmagan`
(ikkala tomonda ham qiymat yo'q — SKU yoki do'kon bog'lanmagan, bu xato emas) ·
`farq` (ko'chishga to'sqinlik qiladi). Aralashtirilsa bog'lanmagan SKU'lar
"8000 ta farq" bo'lib ko'rinardi va haqiqiy farq ko'zdan qochardi.

Jadval tuzilmasini qayta o'qish (natija `docs/v3-sheet-structure.json`):

```bash
cd /root/stocker/server && node src/scripts/dumpSheet.js
```

#### Bog'lanmagan SKU'lar ✅ (2026-08-08)

Buyurtma tarkibidagi SKU `link_product` da MoySklad tovariga ulanmagan bo'lsa,
buyurtma MoySklad'ga **umuman** o'tmaydi. Ilgari bu faqat Telegram'ga xabar
bo'lib ketardi (`uzum-order-to-mc/src/skuAlerts.js`) va xabar o'qilmasa iz
qolmasdi. Endi:

* xabarda SKU kodi bilan birga **tovar nomi, barcode, miqdor, buyurtma va
  do'kon** ham boradi — Uzum SKU nomi ko'pincha ma'nosiz kod
  (`mNZBQ66Qg7N3I6V-dDeim0`), yalang'och yuborilganda xabar hech narsa
  aytmasdi;
* xuddi shu ro'yxat **Tovar bog'lamalari** bo'limining tepasida, qizil kartada
  turadi (`GET /web/link-products/unlinked`). Sabab bo'yicha ikkiga bo'linadi:
  `link_product` da qator yo'q (→ qo'shish formasi ochiladi) yoki qator bor,
  lekin External ID bo'sh (→ jadvaldan topib to'ldiriladi).

Manba — `items.product_ref`: `uzum_order_detail!I` mos topmasa `null` bo'ladi.
`uzum-order-to-mc` dagi topic'ga yuborish mantiqi **o'zgarmadi** (o'sha bot,
guruh va 24 soatlik sovish davri).

selfTest: 406 → **464** (bog'lanmagan SKU, buyurtma formulalari, `.env`
tahriri, do'kon ko'chishi).

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
