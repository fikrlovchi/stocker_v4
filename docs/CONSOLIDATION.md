# Yagona tizim — konsolidatsiya rejasi

2026-08-05 da qabul qilingan yo'nalish: barcha Stocker loyihalari **bitta
repo, bitta domen, bitta dastur** bo'ladi. Namuna — `Server/DMS/v8`
(React SPA + Express + rol/ruxsat + uz/ru + dark/light).

Qabul qilingan to'rt qaror:

| Savol | Qaror |
|---|---|
| Birlashuv chuqurligi | **Bosqichma-bosqich** — avval monorepo, keyin bitta API jarayoni |
| Veb interfeys | **React SPA** (Vite), DMS v8 uslubi |
| Ma'lumotlar bazasi | **Bitta SQLite** |
| Skan doirasi | **Nomlangan partiya** (buyurtma ID ro'yxati) |

---

## 1. Maqsad tuzilishi

```
stocker_v4/                 (GitHub: stocker_v4 · serverda /root/stocker)
├─ server/     API — yig'ish, yorliqlar, panel backend (bosqichma-bosqich birlashadi)
├─ client/     React SPA (Vite) — stocker.uz ning o'zi
├─ panel/      ESKI EJS panel — client/ tayyor bo'lgach yo'q qilinadi
├─ pdfs/       uzumPDFs — API'si server/ ga ko'chadi, UI'si client/ ga
├─ android/    operator ilovasi
├─ desktop/    print client
├─ brand/      logotip, palitra, ikonka quvuri
├─ deploy/     nginx, migratsiya skriptlari
└─ docs/       shu hujjat, kontekst
```

Serverdagi yo'llar ham shunga qarab bitta ildizga yig'iladi:
`/root/stocker/{server,panel,pdfs,...}`.

## 2. Bosqichlar

### 1-bosqich — monorepo ✅ (2026-08-05)

`git subtree` bilan **tarixi saqlangan holda** ko'chirildi:
`fikrlovchi_project_panel` → `panel/`, `uzumpdfs` → `pdfs/`.

Serverda ko'chirish: [`deploy/migrate-to-monorepo.sh`](../deploy/migrate-to-monorepo.sh).
Skript kodni emas, **kodga kirmaydigan** narsalarni ko'chiradi (`.env`, `data/`,
`uploads/`, `oauth.json`) va systemd/pm2 yo'llarini yangilaydi. Eski papkalar
`.bak-<sana>` bo'lib qoladi, tekshiruv o'tmasa qaytarish yo'li chiqadi.

Jarayonlar hozircha alohida: `stocker-server` (4044) · `fikrlovchi-panel`
(3000) · `uzumpdfs` (4040, pm2). Chop etish quvuri tegilmagan.

> Eski GitHub repolari (`fikrlovchi_project_panel`, `uzumpdfs`) o'chirilmaydi —
> arxiv sifatida qoladi, lekin **ishlanmaydi**. Barcha o'zgarish `stocker_v4` da.

### 2-bosqich — bitta baza va foydalanuvchilar ✅ kod tayyor (2026-08-06)

Bajarildi:

* **Umumiy baza** — `data/stocker.db` (repo ildizida). `server/src/config.js`
  va `panel/src/db/index.js` shu faylga qaraydi. Panel'ning migratsiya hisobi
  `panel_schema_migrations` ga ko'chdi: umumiy bazada server'ning o'z
  `schema_migrations` i bor va ustunlari boshqacha (`name` ↔ `filename`).
* **Birlashtirish skripti** — [`deploy/merge-databases.js`](../deploy/merge-databases.js).
  Manba fayllarga tegmaydi, jadval nomlari to'qnashuvini oldindan tekshiradi,
  har jadval bo'yicha qatorlar sonini solishtiradi. Haqiqiy panel bazasida
  sinaldi: 15 jadval, hammasi mos, migratsiya hisobi 7/7 ko'chdi.
* **Foydalanuvchilar** — `006_users.sql` (`users`, `user_permissions`,
  `user_flags`) + [`server/src/auth/users.js`](../server/src/auth/users.js).
* **Partiyalar** — `007_batches.sql` (`batches`, `batch_orders`).
* **Login** endi `users` dan o'qiydi (mobil ilovaga faqat `mobile` bayrog'i
  bilan); `users` bo'sh bo'lsa eski `operators` keshi ishlaydi — ko'chirish
  paytida kirish uzilmaydi.
* `importLegacyUsers()` — `project_users` va panel admini (`.env` dagi hash)
  `users` ga ko'chadi. Takroriy chaqirilsa yangi yozuv yasamaydi.
* selfTest: 118 → **138** tekshiruv.

Qolgan (3-bosqich bilan birga): panel UI'sining "Operatorlar" kartasi o'rniga
**Foydalanuvchilar** va **Ruxsatlar** bo'limlari; partiyalarni boshqarish
ekrani.

### 2-bosqich rejasi (asl matn) ⏳

1. `panel/data/panel.db` va `server/data/stocker.db` **bitta** `data/stocker.db`
   ga birlashadi (migratsiya skripti bilan, jadval nomlari to'qnashmaydi).
2. **Foydalanuvchilar** — bitta jadval, hozirgi ikki xil kirish o'rniga:
   * panel admin (`ADMIN_PASSWORD_HASH` env) → `users` dagi superadmin yozuvi
   * `project_users` (operatorlar) → shu jadvalga ko'chadi
3. **Ruxsatlar** — har foydalanuvchi uchun bo'limlar ro'yxati:

```sql
users(id, login, display_name, password_hash, is_active, is_superadmin, created_at)
user_permissions(user_id, section)     -- 'orders_to_mc' | 'packing' | 'labels' | 'users' | 'settings'
user_flags(user_id, flag)              -- 'mobile'  — mobil ilovaga kirish huquqi
```

Superadmin hamma bo'limni ko'radi va ruxsat bera oladi. Mobil ilovaga faqat
`mobile` bayrog'i bor foydalanuvchi kira oladi.

### 3-bosqich — React SPA ⏳ boshlandi (2026-08-06)

Tayyor:

* `client/` — Vite + React + react-router + i18next (DMS v8 bilan bir xil
  stek). Chiqarish: `bash deploy/publish-client.sh` → `/var/www/stocker/app`,
  nginx uni **`/app/`** da beradi.

  > **Tuzoq:** natijani `/root/stocker/client/dist` dan bermang — `/root`
  > 0700 bilan yopiq, nginx (www-data) o'qiy olmaydi va 403 beradi. Va
  > `location /app/` `/app` (oxirida `/` yo'q) ga mos kelmaydi — redirect
  > qo'shilgan, aks holda so'rov panelga tushib "Cannot GET /app" chiqadi.
* Karkas: chap menyu (ruxsatga qarab), sarlavhada til (uz/ru) va mavzu
  (qora/oq) tanlash. Ranglar faqat CSS tokenlari orqali.
* **Kirish** — `/web/auth/login`, token `localStorage` da.
* **Foydalanuvchilar va ruxsatlar** bo'limi to'liq ishlaydi: qo'shish, ism
  o'zgartirish, parol tiklash, bo'lim/bayroq belgilash, faolsizlantirish,
  o'chirish. Ruxsat va foydalanuvchi bitta ekranda — ruxsat har doim aniq
  odamga beriladi, ikki ekran orasida sakrash ortiqcha qadam bo'lardi.
* Qolgan bo'limlar hozircha eski interfeysga havola qiladi (soxta UI
  chizilmadi).

Brauzerda tekshirildi: kirish, ruxsat saqlash, chegaralangan foydalanuvchiga
`/web/users` → **403**, superadminni o'chirishga → **403**.

**"Yig'ish" bo'limi ✅ (2026-08-06)** — partiyalar to'liq ishlaydi:

* buyurtma ID ro'yxatini joylab partiya yaratish (vergul/bo'shliq/yangi qator
  — hammasi ajratuvchi, takrorlar olib tashlanadi)
* yaratilgandan keyin **hisobot**: nechtasi qo'shildi, qaysi ID keshda
  topilmadi, qaysi biri boshqa ochiq partiyada qolib ketdi
* do'kon bo'yicha guruhlash va `2/22` progress (mobil ilovadagi ko'rsatkich
  bilan bir xil hisob), buyurtmalar jadvali, partiyani yopish/qayta ochish/
  o'chirish, alohida buyurtmani chiqarib tashlash
* **skan doirasi**: ochiq partiya bo'lsa telefon faqat shu ro'yxatdagi
  buyurtmalarni ochadi; partiya yo'q bo'lsa eski xatti-harakat saqlanadi —
  ro'yxat kiritilmagan kuni ish to'xtab qolmasin
* buyurtma yig'ilgach `batch_orders` da `packed` deb belgilanadi (operator
  nomi bilan) — mobil ilovadagi "mening yig'ganlarim" shu yerdan

**"Yorliqlar" bo'limi ✅ (2026-08-06)** — eski `/pdf/` sahifasi React
sahifasiga ko'chdi (`client/src/pages/Labels.jsx`): ID'lar maydoni, ShK/BIG
yasash va holatni kuzatish, PDF konstruktori jonli namunasi, tarix.

Muhim nuqta — **so'rovlar `/pdf/` ga to'g'ridan-to'g'ri bormaydi**. SPA
`Authorization: Bearer` bilan ishlaydi, `/pdf/` esa nginx `auth_request`
orqali panel sessiyasini (cookie) so'raydi — ikkalasi bir-birini tanimaydi.
Shuning uchun oraliq qatlam qo'shildi:

```
SPA ──Bearer──> stocker-server /web/labels/* ──> 127.0.0.1:4040 (uzumPDFs)
```

Yon foydasi: ruxsat bizning `labels` bo'limi bo'yicha tekshiriladi, va
4-bosqichda (jarayonlarni birlashtirish) shu qatlam o'z joyida qoladi.

PDF fayllar `fetch` bilan olinib blob sifatida ko'rsatiladi: `<iframe src>`
va `<a href>` `Authorization` sarlavhasini yubora olmaydi.

uzumPDFs kodiga tegilmadi — faqat ko'rinish ko'chdi. Eski `/pdf/` sahifasi
zaxira sifatida ishlab turaveradi; ildiz SPA'ga o'tgach o'chiriladi.

Keyingi: ildizni SPA'ga o'tkazish va `panel/` ni yo'q qilish, so'ng 4-bosqich.

### 3-bosqich rejasi (asl matn) ⏳

`client/` (Vite + React), DMS v8 dagi tuzilma: chap menyu, bo'limlar, i18n
(uz/ru), dark/light. Bo'limlar:

| Bo'lim | Manbasi |
|---|---|
| Uzum order to MC | hozirgi panel'ning loyiha sahifasi (loglar, boshqaruv, muhit) |
| Stocker — yig'ish | partiyalar, sessiyalar, ish joylari, operator tarixi |
| Yorliqlar | `pdfs/public/index.html` ning React varianti |
| Foydalanuvchilar | yangi |
| Ruxsatlar | yangi |

EJS sahifalar bo'lim ko'chgani sari o'chiriladi; oxirida `panel/` yo'qoladi.

### 4-bosqich — bitta API jarayoni ⏳

`panel/src` va `pdfs/main.js` marshrutlari `server/` ichiga ko'chadi, nginx
bitta portga (4044) qaraydi. **Oxirida** qilinadi: yorliq quvuri
(`/internal/shk-item`) shu servisga bog'liq, u ishlamay qolsa chop etish
to'xtaydi.

---

## 3. Yangi funksiyalar (bosqichlarga taqsimlangan)

### Partiyalar — skan doirasi (2-bosqich bilan birga)

Admin `stocker.uz/pdf/` dagi kabi **buyurtma ID ro'yxatini** joylaydi va unga
nom beradi. Mobil ilova faqat **ochiq partiyadagi** buyurtmalarni ko'radi.

```sql
batches(id, name, created_by, created_at, closed_at)
batch_orders(batch_id, order_id, shop_id, status)   -- status: pending | packed
```

* Do'kon bo'yicha guruhlash `shop_id` dan (kesh'da bor: `uzum_order!G`).
* Mobil ekrandagi `2/22` — shu partiyadagi do'kon bo'yicha
  `packed / jami`.
* Partiya yopilgach tarixda qoladi.

### Mobil ilova ✅ v0.6.0 (2026-08-06)

Bajarildi: do'kon tanlash (yig'ilmagan soni bilan) · tanlangan do'kon
bo'yicha `2/22` · **PRINT** tugmasi (faqat hamma tovar skanerlangach) ·
qo'lda barcode kiritish olib tashlandi · server manzili maydoni olib
tashlandi · uz/ru · qora va oq mavzu · yagona **Sozlamalar** ekrani (hisob,
til, mavzu, ish joyi) · **Men yig'ganlarim** tarixi (sana, buyurtma, tarkibi).

Server tomonidagi o'zgarish: BIG yorlig'i endi avtomatik chiqmaydi
(`config.packing.autoBigPrint = false`) — operator "PRINT" bosganda
`POST /api/session/print` chaqiriladi. Takror bosilsa yangi yorliq
yasalmaydi.

### Mobil ilova — dastlabki reja

| O'zgarish | Izoh |
|---|---|
| Do'kon tanlash | Ochiq partiyadagi yig'ilmagan buyurtmalar soni bilan |
| `2/22` progress | Tanlangan do'kon bo'yicha |
| **Print** tugmasi | Buyurtmaning **barcha** tovarlari skanerlangach faollashadi |
| Qo'lda barcode kiritish | **Olib tashlanadi** |
| Server manzili maydoni | **Olib tashlanadi** (ilovaga qattiq yoziladi) |
| uz/ru | Til tanlash |
| Oq/qora mavzu | Hozir faqat qora — oq qo'shiladi |
| Mening yig'ganlarim | Sana, buyurtma ID, tarkibi |
| Sozlamalar | Login, til, mavzu, ish joyi — bitta ekranda |

Miqdor mantiqi **o'zgarmaydi**: tovardan 2 ta bo'lsa 2 marta skanerlanadi
(hozir ham shunday).

### Desktop client (3-bosqich bilan birga)

* Navbatni tozalash tugmasi
* uz/ru

---

## 4. Xavflar va ularni kamaytirish

| Xavf | Yumshatish |
|---|---|
| Ko'chirishda chop etish to'xtashi | 1-bosqichda jarayonlar tegilmaydi; skript tekshiruv bilan tugaydi va qaytarish yo'lini chiqaradi |
| `pdfs` `process.cwd()` ga bog'liq | pm2 `--cwd` bilan ishga tushiriladi — skriptda hisobga olingan |
| Ikki bazani birlashtirish | Avval nusxa olinadi; jadval nomlari to'qnashmaydi (tekshirilgan) |
| SPA yozilayotganda panel kerak | EJS panel bo'lim ko'chgunicha ishlab turadi |
| Ruxsatlar xatosi | Superadmin hech qachon o'zini bloklay olmaydi; server tomonida har so'rov tekshiriladi (faqat menyu yashirish emas) |
