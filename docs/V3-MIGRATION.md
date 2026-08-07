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

### 2-bosqich — o'qish (jadval eksporti kelgach)

`mc_product` va `mc_stock` serverga: MoySklad'dan to'g'ridan-to'g'ri o'qish,
bazaga yozish, natijani jadvaldagi qiymat bilan solishtirish. Mos kelsa
`MSStockSync` va `importMoySkladShort` triggerlari o'chiriladi.

### 3-bosqich — `link_product` va qoldiq hisobi

`link_product!F1` formulasi va `uzum_stock_mod`/`uzum_stock_mod_detail`
mantiqi server kodiga ko'chadi. **Blokda:** formulalar matni kerak.

### 4-bosqich — yozish

Uzumga qoldiq yuborish (`stock_updater_v3`) va barcode→MoySklad
(`addBarcodeToMC`) serverga o'tadi, jadvalga esa zaxira yoziladi.

### 5-bosqich — Uzum buyurtmalari

Server Uzum API'dan buyurtmalarni tortadi (hozir `uzum-order-to-mc` va
`orders` keshi qiladigan ish), Google Sheets zaxira nusxa bo'lib qoladi.

## Ochiq savollar

2-bosqichni boshlash uchun jadval tuzilmasi kerak. Uni qo'lda eksport
qilish shart emas — server o'sha jadvalga allaqachon OAuth bilan ulanadi
(`config.json:spreadsheetId` aynan shu ID). Serverda:

```bash
cd /root/stocker/server && node src/scripts/dumpSheet.js
```

Skript `docs/v3-sheet-structure.json` ni yozadi: har list uchun nomi, qator
soni, sarlavhalar, birinchi ikki qator va **barcha formulalar**
(`link_product!F1` va `!L1` shu yerda chiqadi). Tokenlar chiqmaydi —
`mc_token` listi o'tkazib yuboriladi, uzun qiymatlar niqoblanadi.

Skriptdan keyin ham qo'lda tushuntirish kerak bo'ladigan yagona narsa —
**`uzum_stock_mod` / `uzum_stock_mod_detail` qanday shart bilan qoldiqni
o'zgartiradi** (formula qaysi qatorni qanday tanlashini kod o'zi aytmaydi).
