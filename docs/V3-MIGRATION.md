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
| `orders_to_mc` | Uzum order to MC | **Integratsiyalar** |
| `settings` | O'zgaruvchilar | **Konfiguratsiya** |
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

### 4-bosqich — yozish

Uzumga qoldiq yuborish (`stock_updater_v3`) va barcode→MoySklad
(`addBarcodeToMC`) serverga o'tadi, jadvalga esa zaxira yoziladi.

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

## Solishtirish natijasi (2026-08-07)

Birinchi yurgizishda 3764 qatordan **5 tasida** `amount` farq qildi. Hammasi
bir xil sababdan: server MoySklad'dan yangi qoldiq oldi, jadvaldagi qiymat esa
oxirgi `MSStockSync` dan qolgan (440 ↔ 442, 35 ↔ 36, 1 ↔ 2, va jadvalda hali
yo'q tovarlar).

Buni taxminda qoldirmaslik uchun `--stock-from-sheet` bayrog'i qo'shildi:
qoldiq ham jadvaldan olinadi, ya'ni ikkala tomon **bir xil** raqamdan
hisoblaydi. Bu rejimda qoladigan har qanday farq — haqiqiy mantiq xatosi.

```bash
cd /root/stocker/server && node src/scripts/v3Sync.js --stock-from-sheet
```

Bundan tashqari import 9 ta qatorda `K` ustunida eski `@N` / `$` qo'shimchasi
qolganini ko'rsatdi — ular tozalanishi kerak.
