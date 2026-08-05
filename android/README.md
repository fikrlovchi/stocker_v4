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

Sinovdan o'tgan kombinatsiya:

| Komponent | Versiya |
|---|---|
| JDK | **21** (`C:\Program Files\Java\jdk-21.0.12`) |
| Android SDK Platform | **35** |
| Gradle | **8.11.1** |
| Android Gradle Plugin | **8.7.3** |
| Kotlin | **2.1.0** |

Eng oson yo'li — **Android Studio** o'rnatish, SDK va JDK ham u orqali
keladi: <https://developer.android.com/studio>

O'rnatgach `Tools → SDK Manager` → "Show Package Details" → **Android SDK
Platform 35** ni belgilang.

> ⚠️ **Gradle JDK ni 21 qilib qo'yish shart.** Yangi Android Studio ichida
> JDK 25 keladi, Gradle 8.11 esa JDK 23 gacha qo'llaydi — JDK 25 bilan build
> yiqiladi. Studio'da: `Settings → Build, Execution, Deployment → Build Tools
> → Gradle → Gradle JDK → 21`.

## APK yasash

Android Studio'da: `Build → Build Bundle(s)/APK(s) → Build APK(s)`

Yoki buyruq satridan (`JAVA_HOME` JDK 21 ga ishora qilishi kerak):

```bash
gradlew.bat assembleRelease
```

Natija: `app/build/outputs/apk/release/app-release.apk` (~32 MB)

> ⚠️ **Android Studio va buyruq satridagi build bir vaqtda ishlamaydi** —
> ikkisi bir xil Gradle qulfini talashadi va biri kutib qolib ketadi. Buyruq
> satridan build qilishdan oldin Studio'ni yoping.

Build davomida chiqadigan, e'tibor bermaslik kerak bo'lgan ogohlantirishlar:

- `SDK XML version 4 was encountered` — Studio'ning SDK'si Gradle'ning
  o'quvchisidan yangiroq, ta'siri yo'q
- `Unable to strip ... libbarhopper_v3.so` — ML Kit va CameraX'ning native
  kutubxonalari siqilmasdan qadoqlanadi, ishlashiga ta'siri yo'q

> Hozir release ham **debug kaliti** bilan imzolanadi (`build.gradle.kts`) —
> shunda APK darhol o'rnatiladi. Play Store'ga chiqarish kerak bo'lsa o'z
> keystore'ingizni yasab, `signingConfigs` ga qo'shish kerak.

Telefonda: Sozlamalar → Xavfsizlik → **"Noma'lum manbalardan o'rnatish"**
ruxsatini bering, so'ng APK'ni oching.

## Oqim

```
Kirish (server manzili, login, parol)
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

**Uchta skanerlash rejimi** — kamera ustidagi tugmalardan tanlanadi va
sozlamalarda saqlanadi:

| Rejim | Formatlar |
|---|---|
| **Shtrix** | EAN-13/8, UPC-A/E, Code128/39/93, ITF, Codabar |
| **QR** | QR, DataMatrix, PDF417, Aztec |
| **Aralash** | ikkalasi ham — o'zi aniqlaydi |

ML Kit qancha kam format qidirsa, shuncha tez va ishonchli o'qiydi. Aralash
rejim qulay, lekin tovarlarda faqat shtrix-kod bo'lsa "Shtrix" rejimi
noto'g'ri o'qishni ham kamaytiradi (yorliqdagi QR tasodifan tushib qolmaydi).

Rejim o'zgarganda **kamera qayta ishga tushmaydi** — analizator har kadrda
eng yangi scanner'ni o'qiydi (`rememberUpdatedState`), shuning uchun
almashish bir zumda bo'ladi.

Nishon ramkasi rejimga qarab o'zgaradi: QR uchun kvadrat, shtrix uchun
cho'ziq — operator kodni qanday tutish kerakligini ko'radi.

**Telefon chirog'i** (kamera ustidagi 🔦) — qorong'i omborda yoki
yaltiroq yorliqda kerak bo'ladi. Tugma faqat qurilmada chiroq bo'lsa
ko'rinadi (`cameraInfo.hasFlashUnit()`). Chiroq holati **saqlanmaydi** —
smena oxirida yoqilgan holda qolib batareyani yeb qo'ymasin.

**Ekran o'chmaydi** (`FLAG_KEEP_SCREEN_ON`) — yig'ish paytida qo'l band.

**Tema doim to'q**, tizim sozlamasi e'tiborga olinmaydi: yorug'lik
o'zgarganda natija ranglari (yashil/qizil/sariq) o'zgarib ketmasligi kerak.

**minSdk 26** (Android 8.0) — faqat adaptive ikonka ishlatiladi, PNG
mipmap'lar kerak emas.

## Sozlash

| Maydon | Qiymat |
|---|---|
| Server manzili | `https://uzum.fikrlovchi.uz/pack` |
| Login | panel'da berilgan login, masalan `operator1` |
| Parol | panel'da berilgan parol |

Login va parol **fikrlovchi-panel**da yaratiladi (loyiha sahifasi →
"Operatorlar"). Ilova `POST /api/auth/login` orqali token oladi va uni
telefonda saqlaydi — har smenada qayta kirish shart emas. Panel'da hisob
faolsizlantirilsa token kuyadi va kirish ekrani qaytadi. ⚙ tugmasi ham shu
ekranni ochadi: server manzilini o'zgartirish yoki boshqa operator sifatida
kirish uchun.

So'ng **ish joyini ulash**: kompyuterdagi Stocker Print ilovasida
"Telefonni ulash" tabini ochib, QR'ni skanerlang. Ulanmasa yorliqlar
navbatda kutib qoladi va chop etilmaydi.

## Natija ranglari

Brend palitrasi `brand/README.md` da. Yashil (`#00FF8C`) eng ko'p uchraydigan
holatga berilgan; "buyurtma ochildi" esa firuzada, chunki ikki yashilni bir
metrdan farqlash qiyin.

| Rang | Ma'nosi |
|---|---|
| 🟢 yashil `#00FF8C` | tovar qabul qilindi |
| 🩵 firuza `#22D3EE` | buyurtma ochildi |
| 🟣 binafsha `#A855F7` | buyurtma to'liq yig'ildi, BIG chop etishga ketdi |
| 🔴 qizil `#FF3B30` | boshqa buyurtmaning tovari / barcode topilmadi |
| 🟠 sariq `#FFB020` | to'liq skanerlangan / bo'sh buyurtma yo'q |

Rangli fon ustidagi matn `onColor()` bilan tanlanadi (yorqin fonda qora,
to'qda oq) — yorqin yashil ustida oq matn o'qilmaydi.

## Tuzilishi

```
app/src/main/java/uz/fikrlovchi/stocker/
├─ MainActivity.kt          ekran yo'naltirish, kamera ruxsati
├─ data/
│  ├─ Api.kt                OkHttp + JSON, `Authorization: Bearer <token>`
│  ├─ Config.kt             SharedPreferences
│  └─ Models.kt             server javoblari
├─ scan/ScannerView.kt      CameraX + ML Kit
├─ ui/
│  ├─ Theme.kt              palitra, natija ranglari
│  ├─ Common.kt             maydon va tugmalar
│  ├─ LoginScreen.kt        server manzili + login/parol (sozlama ham)
│  ├─ PairScreen.kt
│  └─ ScanScreen.kt         asosiy ekran
└─ util/Feedback.kt         tebranish naqshlari
```

## Hali yo'q

- Ish joyi uchun alohida doimiy token (hozir desktop client umumiy
  `SERVICE_TOKEN` bilan ulanadi) — PLAN.md 6.5
