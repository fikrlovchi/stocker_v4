# fikrlovchi-panel

Bir nechta loyihani (dastlab `uzumOrderToMC`) bitta joydan kuzatish va boshqarish
uchun admin panel. `fikrlovchi.uz` domenida ishlaydi.

## Imkoniyatlar

- Har bir loyiha o'z ishga tushishlari (run) haqida hisobotni `POST /api/ingest/runs`
  orqali yuboradi — panel serverga SSH bilan kirmaydi, log fayllarni skanerlamaydi.
- Dashboard: loyihalar ro'yxati, oxirgi xato banneri, "eskirgan" (stale) belgisi.
- Loyiha sahifasi: ishga tushishlar tarixi, har bir run'ning log qatorlari.
- Boshqaruv (faqat `src/config/manageable-units.js` da ro'yxatga olingan loyihalar uchun):
  intervalni o'zgartirish, to'xtatish/davom ettirish, hozir ishga tushirish.
- **Operatorlar** — loyihaning o'z servisiga kiradigan hisoblar (pastga qarang).

## Operatorlar (loyiha foydalanuvchilari)

Loyiha sahifasidagi **"Operatorlar"** kartasi `project_users` jadvalini
boshqaradi: qo'shish · to'liq ismni o'zgartirish · parolni tiklash ·
faolsizlantirish · o'chirish. Bu hisoblar **panel'ga kirmaydi** — ular
loyihaning o'z servisi uchun (masalan stocker'da ombor operatorlari).

Servis ro'yxatni o'z API kaliti bilan tortadi:

```
GET /api/ingest/project-users
Authorization: Bearer <PANEL_API_KEY>
X-Project-Slug: <slug>
→ {"users":[{"login","displayName","passwordHash","isActive"}]}
```

Parol **bcrypt hash** sifatida uzatiladi: servis login'ni mahalliy tekshiradi
va panel o'chib qolganda ham ishlayveradi. Hisob faolsizlantirilsa yoki
o'chirilsa, servis keyingi sinxronda uning tokenlarini bekor qiladi (stocker'da
60 soniya).

## Mahalliy ishga tushirish

```powershell
npm install
cp .env.example .env
node scripts/hash-password.js "parolingiz"   # natijani .env dagi ADMIN_PASSWORD_HASH ga qo'ying
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # SESSION_SECRET uchun
npm start
```

`http://localhost:3000/login` ochiladi.

## Yangi loyiha qo'shish

```bash
node scripts/seed-project.js <slug> "<Ko'rinadigan nom>" [systemd-service] [systemd-timer]
```

Bu bazaga loyihani qo'shadi va bir martalik API kalitni chiqaradi — uni loyihaning
`.env` fayliga `PANEL_API_KEY` sifatida qo'ying.

Loyiha shu **bir xil serverda** ishlasa, `.env`dagi `PANEL_INGEST_URL`ni
`https://fikrlovchi.uz/...` emas, to'g'ridan-to'g'ri ilova portiga ko'rsating:

```
PANEL_INGEST_URL=http://127.0.0.1:3000/api/ingest/runs
```

(TLS/certbot o'rnatilgandan keyin nginx `Host: 127.0.0.1` bilan kelgan
so'rovlarni hech qaysi server_name'ga mos kelmagani uchun `404` bilan
qaytaradi — shuning uchun ichki so'rovlar nginx'ni chetlab o'tishi kerak.)

Agar loyiha systemd orqali boshqarilishi kerak bo'lsa (interval o'zgartirish,
pause/resume, run-now, Muhit sozlamalari orqali `.env` bog'lash),
`src/config/manageable-units.js` ga qo'shing:

```js
'uzum-order-to-mc': {
  serviceUnit: 'uzum-order.service',
  timerUnit: 'uzum-order.timer',
  timerUnitPath: '/etc/systemd/system/uzum-order.timer',
  envPath: '/root/uzum-order-to-mc/.env', // Muhit sozlamalari kartasi uchun (ixtiyoriy)
},
```

Bu **qasddan** kod orqali qilinadi (baza orqali emas) — xavfsizlik uchun: panel
root huquqi bilan systemd buyruqlarini bajaradi va ixtiyoriy fayllarni yozadi,
shuning uchun qaysi unit/fayllarga tegishi mumkinligi faqat deploy qilingan
kodda aniqlanadi.

### Doimiy daemon (timer'siz loyiha)

Ba'zi loyihalar davriy emas, **uzluksiz** ishlaydi (masalan `stocker` — yig'ish
serveri WebSocket bilan telefon va printer clientlarini kutib turadi). Bunda
`timerUnit` va `timerUnitPath` ni `null` qoldiring:

```js
stocker: {
  serviceUnit: 'stocker-server.service',
  timerUnit: null,
  timerUnitPath: null,
  envPath: '/root/stocker/server/.env',
},
```

"Boshqaruv" kartasi o'zini shunga moslaydi: interval va "hozir ishga tushirish"
o'rniga **"Qayta ishga tushirish"** ko'rsatiladi, "To'xtatish/Davom ettirish"
esa timer emas, servisning o'zini to'xtatadi.

---

## Serverga yuklash (Ubuntu/Debian, uzumOrderToMC bilan bir xil droplet)

### 1. Klonlash va o'rnatish

```bash
sudo mkdir -p /root/fikrlovchi-panel   # yoki git clone to'g'ridan-to'g'ri /root ostiga
git clone https://github.com/<username>/fikrlovchi-panel.git /root/fikrlovchi-panel
cd /root/fikrlovchi-panel
npm ci --omit=dev
```

`better-sqlite3` native modul — `npm ci` paytida serverning o'zida kompilyatsiya
qilinadi (Node 20+ va standart build vositalari yetarli).

### 2. `.env` yaratish (qo'lda, git'ga tushmaydi)

```bash
cp .env.example .env
nano .env
```

`ADMIN_PASSWORD_HASH` uchun:
```bash
node scripts/hash-password.js "kuchli-parol"
```
`SESSION_SECRET` uchun:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Ikkalasini ham `.env` ga qo'ying.

### 3. systemd service o'rnatish

```bash
sudo cp deploy/fikrlovchi-panel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fikrlovchi-panel.service
sudo systemctl status fikrlovchi-panel
curl http://127.0.0.1:3000/health   # {"ok":true} qaytishi kerak
```

### 4. nginx reverse proxy

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx-fikrlovchi.uz.conf /etc/nginx/sites-available/fikrlovchi.uz
sudo ln -s /etc/nginx/sites-available/fikrlovchi.uz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. DNS

`fikrlovchi.uz` va `www.fikrlovchi.uz` uchun **A record**ni domen provayderi
panelida serverning IP-manziliga yo'naltiring. Tarqalishini kutish kerak
(`dig fikrlovchi.uz` bilan tekshirish mumkin).

### 6. TLS (certbot)

DNS tarqalgach:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d fikrlovchi.uz -d www.fikrlovchi.uz
```

Certbot nginx konfiguratsiyasini avtomatik yangilaydi va o'zining yangilash
timer'ini o'rnatadi. Shundan so'ng `.env` da `COOKIE_SECURE=true` qilib,
`fikrlovchi-panel.service`ni qayta ishga tushiring:

```bash
sudo systemctl restart fikrlovchi-panel
```

### Yangilash

```bash
cd /root/fikrlovchi-panel
git pull
npm ci --omit=dev
sudo systemctl restart fikrlovchi-panel
```
"# fikrlovchi_project_panel" 
