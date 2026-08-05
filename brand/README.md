# Stocker — brend

Ombor va marketplace'lar orasidagi jarayonlarni avtomatlashtirish ekotizimi.
Domen: **stocker.uz**.

## Palitra

| Rol | HEX | Izoh |
|---|---|---|
| Primary Green | `#00FF8C` | asosiy urg'u: tugmalar, faol holat, logo foni |
| Accent Green | `#00CC6A` | ikkinchi darajali yashil: hover, grafiklar, "tugadi" |
| Background | `#0A0A0A` | fon (deyarli qora) |
| Surface | `#141414` | karta/panel foni (palitradan tashqari, fonning bir pog'ona ustida) |
| Dark Gray | `#3A3A3A` | chegara chiziqlari |
| Primary Gray | `#6B6B6B` | ikkinchi darajali matn |
| Light Gray | `#E6E6E6` | asosiy matn |

Kunduzgi (light) tema **yo'q**: ombor sharoitida to'q fon batareyani ham,
ko'zni ham tejaydi, va rang kodlari yorug'lik o'zgarganda o'zgarmasligi kerak.

### Skan natijasi ranglari — brenddan mustaqil

Yig'ish ekranidagi natija ranglari **funksional**, brend uchun emas: operator
ularni bir metrdan farqlashi kerak. Shuning uchun brend yashili faqat **eng
ko'p uchraydigan** ijobiy holatga (tovar qabul qilindi) berilgan, qolganlari
ataylab boshqa tonlarda:

| Holat | Rang | Nega |
|---|---|---|
| Tovar qabul qilindi | `#00FF8C` brend yashili | eng tez-tez ko'rinadigan holat |
| Buyurtma ochildi | `#22D3EE` moviy-firuza | yashil bilan yonma-yon aralashmaydi |
| Buyurtma yig'ildi | `#A855F7` binafsha | smena natijasi — alohida ton |
| Xato (boshqa tovar / topilmadi) | `#FF3B30` qizil | |
| Ogohlantirish | `#FFB020` sariq | |

## Logotip fayllari va ikonkalar

**Qoida: logotip o'zgartirilmaydi** — faqat o'lchami kichraytiriladi. Shuning
uchun ikonkalar qo'lda chizilmaydi, original fayldan generatsiya qilinadi:

```bash
node brand/scripts/makeIcons.js
```

Kirish fayli (git'da bo'lishi kerak):

| Fayl | Nima | Talab |
|---|---|---|
| `brand/logo-icon.png` | kvadrat ikonka varianti (yashil fon + qora "S") | 8-bitli oddiy (non-interlaced) PNG, ≥512×512 |

Skript yasaydi:

* `desktop/src/assets/icon.ico` (256) va `tray.png` (32)
* `android/.../res/mipmap-*/ic_launcher.png` — logotip to'liq holda
* `android/.../res/mipmap-*/ic_launcher_foreground.png` — adaptive ikonka
  uchun logotip 108dp kanvasning markazida, 72dp xavfsiz maydonda (launcher
  chetini qirqsa ham "S" butun qoladi)
* `mipmap-anydpi-v26/ic_launcher.xml` — foreground shu PNG'ga ko'rsatiladi

Tashqi kutubxona yo'q: PNG o'qish/yozish va maydon bo'yicha kichraytirish
skript ichida, faqat `zlib` bilan. Sabab — build mashinasiga `sharp`/`canvas`
o'rnatish shart bo'lmasin.

## Belgi (mark) — vaqtinchalik qayta chizilgan variant

`stocker-mark.svg` — yashil kvadrat ichida qora **S**: yo'nalish chizig'i
(ombor → tizim → marketplace) ko'rinishida, uchlari dumaloq va nuqta bilan
yakunlangan. Bir rangli fon uchun `stocker-mark-mono.svg` (yashil chiziq,
shaffof fon).

Qo'llanishi:

| Joy | Fayl |
|---|---|
| Android adaptive ikonka | `android/.../res/drawable/ic_launcher_foreground.xml` (vektor, shu belgidan) |
| Desktop ilova/o'rnatgich | `desktop/src/assets/icon.ico` (`npm run icons` bilan yasaladi) |
| Desktop tray | `desktop/src/assets/tray.png` |

> ⚠️ Bu SVG'lar original logotipdan **qayta chizilgan** — hozircha
> `brand/logo-icon.png` qo'yilmagani uchun ikonkalar shu chizmadan yasalgan.
> Original fayl qo'yilib `makeIcons.js` ishga tushirilgach, ikonkalar
> **aynan original** logotipdan yasaladi va bu qayta chizma faqat SVG kerak
> bo'lgan joylar uchun (landing, hujjatlar) qoladi. Original vektor bo'lsa,
> `stocker-logo.svg` / `stocker-wordmark.svg` nomi bilan qo'yish ham mumkin.

## Tipografika

Wordmark'da yupqa, geometrik, dumaloq uchli shrift ishlatilgan. Interfeysda
alohida shrift yuklanmaydi: Android'da tizim shrifti (Roboto), desktop'da
Segoe UI. Sabab — ombor ilovasi oflayn ishlashi kerak, veb-shrift yuklash
qo'shimcha nosozlik nuqtasi.
