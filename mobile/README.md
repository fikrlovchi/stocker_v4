# Stocker — mobil ilova (Expo / Android)

Operator omborda tovar barcode'ini skanerlaydi, ilova buyurtmani avtomatik
topadi va har skan uchun yorliq desktop client orqali termo printerdan
chiqadi.

## Oqim

```
Sozlash (server, kalit, operator)
   ↓
Ish joyini ulash — desktop ilovadagi QR'ni skanerlash
   ↓
Skanerlash: tovar → buyurtma avtomatik ochiladi → progress → yig'ildi
```

## Qanday qaror qabul qilingan

**Sessiya telefonda emas, SERVERDA.** Ilova yopilib ochilsa, telefon
internetni yo'qotib qayta ulansa yoki boshqa telefonga o'tilsa — yig'ish
o'sha joyidan davom etadi. Ilova ishga tushganda `GET /api/session` bilan
holatni tiklaydi.

**Xato natijalar HTTP 200 bilan keladi.** Server `result` maydonini
qaytaradi (`ok`, `wrong_item`, `unknown_barcode`, …), ilova esa unga qarab
rang, sarlavha va tebranish beradi. Shunda "tovar noto'g'ri" bilan "tarmoq
uzildi" bir-biridan aniq farqlanadi — ikkinchisi sariq "ULANISH YO'Q"
tasmasi bo'lib chiqadi.

**Tebranish naqshlari har xil.** Omborda operator ekranga qaramasdan ham
natijani bilishi kerak: qabul qilindi — bitta qisqa, xato — uchta kuchli,
buyurtma yig'ildi — uzun ketma-ketlik.

**Bir xil barcode 2.5 soniya ichida takror hisoblanmaydi.** Kamera bir
kodni sekundiga o'nlab marta beradi; bu bo'lmasa bitta tovar bir necha
marta skanerlangan bo'lib qolardi.

**Ekran o'chmaydi** (`expo-keep-awake`) — yig'ish paytida qo'l band.

**react-navigation ishlatilmadi** — uchta ekran uchun ortiqcha bog'liqlik.

## Ishga tushirish

```bash
npm install
```

```bash
npx expo start
```

Telefonda **Expo Go** ilovasini o'rnatib, terminaldagi QR'ni skanerlang.
Telefon va kompyuter bir Wi-Fi'da bo'lishi kerak (bu faqat ishlab chiqish
uchun; serverga ulanish alohida masala).

Versiyalar mos kelmasa:

```bash
npx expo install --fix
```

## Sozlash

| Maydon | Qiymat |
|---|---|
| Server manzili | `https://uzum.fikrlovchi.uz/pack` |
| Kalit | serverdagi `SERVICE_TOKEN` (8-fazada operator paroli bilan almashadi) |
| Operator | ismingiz, masalan `aziz` |

So'ng **ish joyini ulash**: kompyuterdagi Stocker Print ilovasida
"Telefonni ulash" tabini ochib, QR'ni skanerlang. Ulanmasa yorliqlar
navbatda kutib qoladi va chop etilmaydi.

## Natija ranglari

| Rang | Ma'nosi |
|---|---|
| 🔵 ko'k | buyurtma ochildi |
| 🟢 yashil | tovar qabul qilindi |
| 🟣 binafsha | buyurtma to'liq yig'ildi, BIG chop etishga ketdi |
| 🔴 qizil | boshqa buyurtmaning tovari / barcode topilmadi |
| 🟠 sariq | to'liq skanerlangan / bo'sh buyurtma yo'q |

## APK yasash

```bash
npx eas build -p android --profile preview
```

Buning uchun Expo akkaunti va `eas.json` kerak. Ishlab chiqish davrida
Expo Go yetarli.

## Hali yo'q (8-faza)

- Operator **login/parol** bilan kiradi (hozir kalit + ism qo'lda kiritiladi)
- Ish joyi uchun alohida doimiy token (hozir umumiy `SERVICE_TOKEN`)
