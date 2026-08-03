# Stocker — Android ilova (native Kotlin)

Operator omborda tovar barcode'ini skanerlaydi, ilova buyurtmani avtomatik
topadi va har skan uchun yorliq desktop client orqali termo printerdan
chiqadi.

**Uchinchi tomon ilovasi kerak emas** — telefonga faqat `Stocker.apk`
o'rnatiladi. Expo Go, React Native yoki boshqa runtime yo'q.

## Nima ishlatilgan

| Qism | Vosita | Nega |
|---|---|---|
| UI | Jetpack Compose + Material 3 | XML layout'siz, kam kod |
| Kamera | CameraX | Android'ning rasmiy kamera qatlami |
| Barcode | **ML Kit (bundled)** | Model APK ichida — Google Play Services ham, internet ham kerak emas |
| Tarmoq | OkHttp + kotlinx.serialization | Yengil, Retrofit'siz |
| Sozlamalar | SharedPreferences | Qiymatlar oddiy va kam |

## Build muhiti

Loyihani yig'ish uchun ikkita narsa kerak (hozir kompyuterda **yo'q**):

1. **JDK 17** — Android Gradle Plugin 8.x shuni talab qiladi
2. **Android SDK** (API 35)

Eng oson yo'li — **Android Studio** o'rnatish (ikkalasi ham ichida keladi):
<https://developer.android.com/studio>

O'rnatgach: `File → Open` → `stocker_v4/android` papkasini tanlang. Studio
Gradle wrapper'ni o'zi yasaydi va bog'liqliklarni yuklab oladi (birinchi
sinxronizatsiya ~10 daqiqa).

> `gradlew` / `gradle-wrapper.jar` repoda yo'q (binar fayl). Android Studio
> loyihani ochganda uni o'zi yasaydi. Studio'siz qilish uchun tizimda Gradle
> bo'lishi va bir marta `gradle wrapper` bajarilishi kerak.

## APK yasash

Android Studio'da: `Build → Build Bundle(s)/APK(s) → Build APK(s)`

Yoki buyruq satridan:

```bash
gradlew.bat assembleRelease
```

Natija: `app/build/outputs/apk/release/app-release.apk`

> Hozir release ham **debug kaliti** bilan imzolanadi (`build.gradle.kts`) —
> shunda APK darhol o'rnatiladi. Play Store'ga chiqarish kerak bo'lsa o'z
> keystore'ingizni yasab, `signingConfigs` ga qo'shish kerak.

Telefonda: Sozlamalar → Xavfsizlik → **"Noma'lum manbalardan o'rnatish"**
ruxsatini bering, so'ng APK'ni oching.

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
o'sha joyidan davom etadi. Ishga tushganda `GET /api/session` bilan holat
tiklanadi.

**ML Kit'ning bundled varianti.** Model APK ichida olib yuriladi (~2.5 MB),
shuning uchun Google Play Services yoki internet kerak emas. Omborda Wi-Fi
zaif bo'lsa ham skan ishlaydi.

**Tarmoq xatosi va tovar xatosi ajratilgan.** Server `result` maydonini
HTTP 200 bilan qaytaradi (`wrong_item`, `unknown_barcode`, …) → qizil
banner. Tarmoq uzilsa → sariq "ULANISH YO'Q" tasmasi. Operator "men
noto'g'ri tovar oldim" bilan "internet yo'q" ni chalkashtirmaydi.

**Tebranish naqshlari keskin farq qiladi** — qabul qilindi bitta qisqa,
xato uchta kuchli, buyurtma yig'ildi uzun ketma-ketlik. Omborda operator
ekranga qaramasdan ham natijani biladi.

**Bir xil barcode 2.5 soniya ichida takror hisoblanmaydi.** Kamera bir
kodni sekundiga o'nlab marta beradi; busiz bitta tovar bir necha marta
skanerlangan bo'lib qolardi.

**Faqat kerakli barcode formatlari yoqilgan** (EAN-13/8, UPC-A/E,
Code128/39/93, ITF, Codabar). Cheklangan ro'yxat tanib olishni tezlashtiradi
va noto'g'ri o'qishni kamaytiradi.

**Ekran o'chmaydi** (`FLAG_KEEP_SCREEN_ON`) — yig'ish paytida qo'l band.

**Tema doim to'q**, tizim sozlamasi e'tiborga olinmaydi: yorug'lik
o'zgarganda natija ranglari (yashil/qizil/sariq) o'zgarib ketmasligi kerak.

**minSdk 26** (Android 8.0) — faqat adaptive ikonka ishlatiladi, PNG
mipmap'lar kerak emas.

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

## Tuzilishi

```
app/src/main/java/uz/fikrlovchi/stocker/
├─ MainActivity.kt          ekran yo'naltirish, kamera ruxsati
├─ data/
│  ├─ Api.kt                OkHttp + JSON (8-fazada JWT shu yerda)
│  ├─ Config.kt             SharedPreferences
│  └─ Models.kt             server javoblari
├─ scan/ScannerView.kt      CameraX + ML Kit
├─ ui/
│  ├─ Theme.kt              palitra, natija ranglari
│  ├─ Common.kt             maydon va tugmalar
│  ├─ SetupScreen.kt
│  ├─ PairScreen.kt
│  └─ ScanScreen.kt         asosiy ekran
└─ util/Feedback.kt         tebranish naqshlari
```

## Hali yo'q (8-faza)

- Operator **login/parol** bilan kiradi (hozir kalit + ism qo'lda kiritiladi)
- Ish joyi uchun alohida doimiy token (hozir umumiy `SERVICE_TOKEN`)
