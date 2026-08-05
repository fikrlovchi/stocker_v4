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
| `brand/logo-icon.png` | ikonka varianti (yashil fon + qora "S") | 8-bitli oddiy (non-interlaced) PNG, ≥512×512 |
| `brand/logo-text.png` | yozuvli logotip (wordmark) | shu talablar; fon qora bo'lsa ham bo'ladi |

Ikkisi ham joyida (761×802 va 1411×359). Ikonka kvadrat bo'lmagani uchun
**shaffof to'ldirish** bilan kvadratga keltiriladi — cho'zilmaydi, nisbati
saqlanadi. Wordmark foni esa shaffof qilinadi (`unblack`): har piksel qora
ustidagi rang deb qaraladi, alfa eng yorqin kanaldan olinadi va rang shu
alfaga qayta bo'linadi. Natijada to'q sathda **aynan asl ko'rinish**, lekin
karta foni (#141414) ustida ham qora to'rtburchak chiqmaydi.

> Wordmark faqat **to'q** sathlar uchun: kulrang harflar shaffoflik orqali
> ifodalanadi, yorug' fonda ular oqarib ketadi. Brendda kunduzgi tema yo'q,
> shuning uchun muammo emas.

Skript yasaydi:

* `desktop/src/assets/icon.ico` (256), `tray.png` (32) va `wordmark.png` (600)
* `android/.../res/mipmap-*/ic_launcher.png` — logotip to'liq holda
* `android/.../res/mipmap-*/ic_launcher_foreground.png` — adaptive ikonka
  uchun logotip 108dp kanvasning markazida, 72dp xavfsiz maydonda (launcher
  chetini qirqsa ham "S" butun qoladi)
* `mipmap-anydpi-v26/ic_launcher.xml` — foreground shu PNG'ga ko'rsatiladi
* `android/.../res/drawable-nodpi/logo_wordmark.png` — kirish ekranidagi wordmark
* `brand/generated/logo-wordmark.png` — panel repo'siga ko'chirish uchun
  (`fikrlovchi_project_panel/public/logo-wordmark.png`)

Wordmark interfeyslarda bir xil joyda turadi — **yuqori chapda**: panel
sarlavhasida (`topbar.ejs`), desktop client sarlavhasida va Android kirish
ekranining tepasida. Skan ekranida ataylab yo'q: u yerda yuqori chap burchak
operator ismi va ish joyi uchun kerak, ish paytida brend emas, kim nima
yig'ayotgani muhim.

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
| stocker.uz landing | `web/landing/index.html` (inline SVG) |
| Favicon (SVG kerak bo'lganda) | `stocker-mark.svg` |

> Bu SVG'lar original logotipdan **qayta chizilgan** va faqat vektor kerak
> bo'lgan joylarda ishlatiladi (landing sahifasi, hujjatlar, favicon SVG).
> Ilova ikonkalari esa **original rasm fayllardan** yasaladi — yuqoridagi
> jadvalga qarang. Original vektor (SVG/AI) bo'lsa, `stocker-logo.svg` nomi
> bilan qo'yilsa, landing ham unga o'tadi.

## Tipografika

Wordmark'da yupqa, geometrik, dumaloq uchli shrift ishlatilgan. Interfeysda
alohida shrift yuklanmaydi: Android'da tizim shrifti (Roboto), desktop'da
Segoe UI. Sabab — ombor ilovasi oflayn ishlashi kerak, veb-shrift yuklash
qo'shimcha nosozlik nuqtasi.
