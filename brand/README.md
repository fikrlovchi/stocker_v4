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

## Belgi (mark)

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

> Bu SVG'lar original logotipdan **qayta chizilgan** (bizga faqat rasm
> ko'rinishi berilgan). Original vektor fayllar bo'lsa, shu papkaga
> `stocker-logo.svg` / `stocker-wordmark.svg` nomi bilan qo'ying va
> ikonkalarni ulardan qayta yasash mumkin — o'shanda bu izoh olib tashlanadi.

## Tipografika

Wordmark'da yupqa, geometrik, dumaloq uchli shrift ishlatilgan. Interfeysda
alohida shrift yuklanmaydi: Android'da tizim shrifti (Roboto), desktop'da
Segoe UI. Sabab — ombor ilovasi oflayn ishlashi kerak, veb-shrift yuklash
qo'shimcha nosozlik nuqtasi.
