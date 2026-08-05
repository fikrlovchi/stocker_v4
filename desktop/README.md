# Stocker Print — desktop client

Ish joyidagi Windows kompyuterda ishlaydigan tray ilova. Serverga WebSocket
bilan ulanib turadi, kelgan print job'larni PDF sifatida yuklab olib termo
printerdan chiqaradi va ACK qaytaradi.

| Yorliq | Printer | Masshtab | Yo'nalish |
|---|---|---|---|
| **ShK** (40×30 mm) | Proton DTP-4207 | `noscale` — yorliq aynan shu o'lchamda yasalgan | drayver sozlamasi |
| **BIG** (101.6×101.6 mm) | Gainsha GS-2408 | `shrink` — Uzum labeli 166×242 mm, qog'ozga sig'diriladi | drayver sozlamasi |

Masshtab va **qog'oz yo'nalishi** ikkalasi ham Sozlamalar tabidan tanlanadi —
drayver injiqligini qayta build qilmasdan hal qilish uchun.

### Yorliq noto'g'ri burilib chiqsa

Uch xil yechim bor, **shu tartibda** sinang — pastdagilari yuqoridagisi
ishlamaganda:

1. **Windows printer sozlamasi** — qog'oz o'lchamini to'g'rilash (ShK uchun
   40×30 mm). Eng to'g'ri yechim: drayver o'zi burmaydigan bo'ladi.
2. **Client'dagi yo'nalish** — Sozlamalar → "ShK qog'oz yo'nalishi" →
   `landscape` yoki `portrait`.
3. **Server tomonida** — `uzumpdfs/.env` da `SHK_ROTATE=90` (bet darajasidagi
   `/Rotate`).

> ⚠️ 2 va 3 ni **birga ishlatmang** — ikkisi qo'shilib yorliq teskari chiqadi.

## Nega shunday qilingan

**WebSocket, HTTP server emas.** PC serverga **o'zi ulanadi** (chiquvchi
ulanish). Shuning uchun ish joyida port ochish, statik IP olish yoki telefon
bilan bir tarmoqda bo'lish kerak emas — operator uydan turib ham skanerlashi
mumkin.

**`pdf-to-printer`, Electron'ning `webContents.print` emas.** Bu paket ichida
SumatraPDF bor (alohida yuklab olish kerak emas) va printerni aniq tanlab,
masshtabsiz chop eta oladi. Electron'ning o'z chop etishi masshtablab yuboradi
— 40×30 mm yorliqda bu qabul qilib bo'lmaydi.

**Takroriy chop etishga qarshi `printed.json`.** Server ACK olmagan jobni
qayta yuboradi. Client chop etgan `jobId`larni diskda saqlaydi, shuning uchun
ilova qayta ishga tushsa ham bir yorliq ikki marta chiqmaydi. Tartib muhim:
avval `markPrinted`, keyin ACK — ACK yo'lda yo'qolsa ham takror bo'lmaydi.

## Ishga tushirish (ishlab chiqish)

```powershell
npm install
npm start
```

## Sozlash

**Sozlamalar** tabida:

| Maydon | Qiymat |
|---|---|
| Server manzili | `https://stocker.uz/pack` (nginx sozlangunicha `http://SERVER_IP:4044`) |
| Kalit | serverdagi `SERVICE_TOKEN` (8-fazada har ish joyiga alohida token beriladi) |
| Ish joyi kodi | `Ombor-1` — serverdagi `stations` jadvaliga shu nom bilan yoziladi |
| ShK / BIG printeri | Windows printerlar ro'yxatidan |

Har printer yonida **Sinov** tugmasi bor: server sinov sahifasini yasab
beradi (`/print/test-page`), ya'ni bitta bosishda butun zanjir tekshiriladi —
ulanish, token, PDF olish va chop etish.

**Telefonni ulash** tabida QR chiqadi; operator smena boshida uni skanerlaydi
va shundan keyin uning yorliqlari shu kompyuterdan chiqadi.

Sozlamalar `%APPDATA%\stocker-print-client\config.json` da saqlanadi
(tray menyusidagi "Sozlamalar papkasi" bilan ochiladi).

## Windows uchun o'rnatgich yasash

```powershell
npm run build
```

`dist/` papkasida NSIS o'rnatgich paydo bo'ladi —
**`dist/Stocker Print Setup 0.2.0.exe`** (~86 MB, ichida Electron ham bor).
O'rnatilgandan keyin PowerShell umuman kerak emas — ilova Start menyusidan
ochiladi va Windows bilan birga tray'da ishga tushadi.

O'rnatgich `oneClick: false` bilan yasaladi: papkani tanlash mumkin va
o'rnatish **administrator huquqisiz**, faqat joriy foydalanuvchi uchun ketadi.

> **SmartScheen ogohlantirishi.** Fayl kod-imzo sertifikati bilan
> imzolanmagan (bizda sertifikat yo'q), shuning uchun Windows birinchi
> ishga tushirishda "Windows protected your PC" deb to'sadi:
> **Batafsil (More info) → Baribir ishga tushirish (Run anyway)**.
> Har bir yangi versiyada takrorlanadi. Yo'q qilish uchun to'lovli
> code-signing sertifikati kerak bo'ladi.

### ⚠️ "Cannot create symbolic link: A required privilege is not held"

`electron-builder` `winCodeSign` arxivini ochayotganda symlink yarata olmasa
shu xato chiqadi (arxiv ichida macOS uchun symlink'lar bor, ular bizga kerak
emas, lekin 7-zip baribir yiqiladi).

**Yechim: Developer Mode'ni yoqing** — shundan keyin barcha build'lar
administratorsiz ishlaydi:

```
Sozlamalar → Maxfiylik va xavfsizlik → Ishlab chiquvchilar uchun
→ "Ishlab chiquvchi rejimi" (Developer Mode) → Yoqilgan
```

Yoki bir martalik: terminalni **"Administrator sifatida ishga tushirish"**
bilan ochib, `npm run build` ni qayta bajaring.

Ikkalasi ham iloji bo'lmasa, keshni tozalab ko'ring:

```powershell
Remove-Item "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Force
```

### Ikonkalar

Ikonka va tray belgisi `brand/stocker-mark.svg` dan qayta chizilgan: yashil
dumaloq kvadrat, ichida qora "S". `scripts/makeIcon.js` uni piksel darajasida
o'zi yasaydi (tashqi rasm kutubxonasi yo'q) — chegaralar bir piksel
yumshatiladi, aks holda 32×32 tray ikonkasi tishli chiqadi.

```powershell
npm run icons
```

`src/assets/tray.png` (32×32) va `src/assets/icon.ico` (256×256) kodda
yasaladi — tashqi rasm yuklab olinmaydi.

## Tuzilishi

```
src/
├─ main.js              Electron: tray, oyna, IPC, job ishlov berish
├─ wsClient.js          WebSocket + eksponensial qayta ulanish
├─ printer.js           pdf-to-printer (SumatraPDF) o'rovi
├─ config.js            sozlamalar + chop etilgan joblar ro'yxati
├─ preload.js           renderer ↔ main ko'prigi (contextIsolation)
├─ assets/tray.png      tray ikonkasi (scripts/makeIcon.js yasaydi)
└─ renderer/            UI: navbat, sozlamalar, QR, loglar
```

## Hali yo'q (keyingi fazalar)

- **Bir martalik enrollment kod** bilan ro'yxatdan o'tish va har ish joyiga
  alohida doimiy token (hozircha umumiy `SERVICE_TOKEN`) — 8-faza
- Panel'dan ish joylarini boshqarish (nom, printerlar, tokenni bekor qilish) — 8-faza
