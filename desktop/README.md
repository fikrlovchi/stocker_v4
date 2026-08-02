# Stocker Print — desktop client

Ish joyidagi Windows kompyuterda ishlaydigan tray ilova. Serverga WebSocket
bilan ulanib turadi, kelgan print job'larni PDF sifatida yuklab olib termo
printerdan chiqaradi va ACK qaytaradi.

| Yorliq | Printer | Masshtab |
|---|---|---|
| **ShK** (40×30 mm) | Proton DTP-4207 | `noscale` — yorliq aynan shu o'lchamda yasalgan |
| **BIG** (101.6×101.6 mm) | Gainsha GS-2408 | `fit` — Uzum labeli 166×242 mm, qog'ozga sig'diriladi |

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
| Server manzili | `https://uzum.fikrlovchi.uz/pack` (nginx sozlangunicha `http://SERVER_IP:4044`) |
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

`dist/` papkasida NSIS o'rnatgich paydo bo'ladi.

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
