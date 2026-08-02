# stocker-server

Uzum buyurtmalarini omborda skanerlab yig'ish serveri. To'liq reja: [../PLAN.md](../PLAN.md).

**Hozirgi holat: 1-faza bajarildi** — buyurtma keshi va barcode indeksi.
Skan/sessiya (4-faza), print quvuri (5-faza), autentifikatsiya (8-faza) hali yo'q.

## Nima qiladi

Har 60 soniyada Google Sheets'dan `uzum_order`, `uzum_order_detail` va
`uzum_packing` varaqlarini o'qiydi, MoySklad'dan bekor qilingan buyurtmalar
ro'yxatini oladi va yig'ishga tayyor buyurtmalarni SQLite keshiga yozadi.
Barcode bo'yicha buyurtma topish uchun indeks quradi.

## Buyurtma qaysi shartda yig'ishga chiqadi

| Shart | Sabab |
|---|---|
| `uzum_order!Q = 1` | MoySklad'da yaratilgan |
| `uzum_order!T = 1` | Uzum'da tasdiqlangan |
| `uzum_order!U = "done"` | MoySklad holati o'rnatilgan — **kutish oynasidagilar** (`hold`) **va hali ishlanmaganlar** (bo'sh) chiqib ketadi |
| `uzum_order!W` oxirgi 3 kun ichida | Kesh oynasi (`W` bo'sh bo'lsa `C` ishlatiladi) |
| MoySklad'da "Otmenen" emas | Bitta bulk so'rov, `externalCode` bo'yicha |
| `uzum_packing`da `done` yozuvi yo'q | Allaqachon yig'ilmagan |

> ⚠️ **`uzum_order!V` ATAYLAB ishlatilmaydi.** `cancelSync.js:148` buyurtma
> tushganidan 24 soat o'tgach, bekor qilinmagan bo'lsa ham `V=1` qo'yadi
> (monitoring tugadi degani). V bo'yicha filtrlash 24 soatdan oshgan sog'lom
> buyurtmalarni yo'qotib yuborardi. Shuning uchun bekor qilinganlik faqat
> MoySklad holatidan aniqlanadi.

Mos kelmagan buyurtmalar ham keshda saqlanadi — `eligible=0` va **sababi** bilan.
Shunda "nega bu buyurtma skanerlanmayapti?" savoliga `/debug/order/<id>` javob
beradi. Faqat 3 kunlik oynadan tashqaridagilar umuman saqlanmaydi.

## Mahalliy ishga tushirish (Windows)

```powershell
npm install
copy .env.example .env
```

`.env` ni to'ldiring (`MOYSKLAD_TOKEN`, `SERVICE_TOKEN`), so'ng `oauth.json` ni
nusxalang — u `uzumPDFs` loyihasida bor (git'ga tushmaydi, faqat serverda):

```bash
scp root@64.226.69.129:/root/uzumpdfs/oauth.json ./oauth.json
```

Keyin:

```bash
node src/index.js
```

## Tekshirish

**Google/MoySklad'siz — mantiq testi** (39 ta tekshiruv, vaqtinchalik bazada):

```bash
node src/scripts/selfTest.js
```

**Haqiqiy ma'lumot bilan — bir marta yangilash** (server ko'tarmasdan):

```bash
node src/scripts/refreshOnce.js
```

## Endpointlar

`/health` ochiq, qolgani `X-Service-Token` talab qiladi.

| Endpoint | Vazifa |
|---|---|
| `GET /health` | Oxirgi yangilanish holati (nginx/monitoring uchun) |
| `GET /debug/stats` | Kesh statistikasi + sabablar bo'yicha taqsimot |
| `POST /debug/refresh` | Keshni darhol yangilash |
| `GET /debug/order/:id` | Bitta buyurtma: tovarlari, barcode'lari, **mos/nomos va sababi** |
| `GET /debug/barcode/:code` | Barcode bo'yicha qidiruv. `?all=1` — nomos buyurtmalar ham |
| `GET /debug/ambiguous` | Bir xil barcode turli tovarlarga biriktirilgan holatlar |

Misollar:

```bash
curl -s -H "X-Service-Token: $TOKEN" http://127.0.0.1:4043/debug/stats
```

```bash
curl -s -H "X-Service-Token: $TOKEN" http://127.0.0.1:4043/debug/order/117360845
```

```bash
curl -s -H "X-Service-Token: $TOKEN" http://127.0.0.1:4043/debug/barcode/1000111953348
```

## Serverga yuklash

```bash
git clone <repo> /root/stocker
cd /root/stocker/server
npm ci --omit=dev          # better-sqlite3 serverda kompilyatsiya qilinadi
cp /root/uzumpdfs/oauth.json ./oauth.json
cp .env.example .env && nano .env
node src/scripts/refreshOnce.js    # sozlamalarni tekshirish
sudo cp deploy/stocker-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stocker-server
journalctl -u stocker-server -f
```

nginx/TLS sozlamasi: [../PLAN.md](../PLAN.md) 8-bo'lim.

Panel'ga ulash:

```bash
cd /root/fikrlovchi-panel && node scripts/seed-project.js stocker "Stocker — yig'ish"
```

Chiqqan kalitni `.env` dagi `PANEL_API_KEY` ga qo'ying.

## Tuzilishi

```
src/
├─ index.js               Express + yangilash tsikli
├─ config.js              config.json + .env
├─ logger.js              fayl + konsol + panel buferi
├─ cache/
│  ├─ readSheets.js       Sheets o'qish (render option'lar izohi bilan)
│  ├─ eligibility.js      buyurtma yig'ishga chiqadimi — yagona qaror joyi
│  ├─ refresh.js          applyRefresh (sof mantiq) + refreshCache (I/O)
│  └─ queries.js          keshdan o'qish, barcode qidiruvi
├─ moysklad/
│  ├─ client.js           msFetch (429 retry), holat o'qish
│  └─ canceledOrders.js   bekor qilinganlar ro'yxati (1 so'rov)
├─ google/sheetsClient.js OAuth2 (uzbuyo@gmail.com)
├─ db/                    SQLite + migratsiyalar
├─ panel/reporter.js      fikrlovchi-panel'ga hisobot (har 5 daqiqa)
└─ scripts/
   ├─ selfTest.js         fixture bilan mantiq testi
   └─ refreshOnce.js      bir marta yangilash
```

### Diqqat: kesh har tsiklda qayta quriladi

`orders` / `items` / `item_barcodes` jadvallari har yangilanishda `DELETE` +
`INSERT` qilinadi. Keyingi fazalardagi sessiya/lock jadvallari bu jadvallarga
**FOREIGN KEY qo'ymasligi kerak** — sessiya ochilganda kerakli maydonlarni
nusxalab olsin, aks holda yangilanish ochiq sessiyani o'chirib yuboradi.
