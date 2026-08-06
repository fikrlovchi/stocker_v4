// Systemd orqali boshqarilishi mumkin bo'lgan loyihalarning qattiq kodlangan
// ro'yxati. Bu yerga qo'shish — kod o'zgarishi va deploy talab qiladi, shunchaki
// bazaga yozish orqali emas: shu tarzda sessiya o'g'irlansa ham (yoki CSRF
// aylanib o'tilsa ham) hujumchi bazaga yangi loyiha yozib, ixtiyoriy systemd
// unit'ini boshqara olmaydi.
module.exports = {
  'uzum-order-to-mc': {
    serviceUnit: 'uzum-order.service',
    timerUnit: 'uzum-order.timer',
    timerUnitPath: '/etc/systemd/system/uzum-order.timer',
    envPath: '/root/uzumOrderToMC/.env',
  },
  'cancel-uzum-order': {
    serviceUnit: 'cancel-uzum-order.service',
    timerUnit: 'cancel-uzum-order.timer',
    timerUnitPath: '/etc/systemd/system/cancel-uzum-order.timer',
    envPath: '/root/cancelUzumOrder/.env',
  },
  'mc-stock-to-uzum': {
    serviceUnit: 'mc-stock.service',
    timerUnit: 'mc-stock.timer',
    timerUnitPath: '/etc/systemd/system/mc-stock.timer',
    envPath: '/root/stockerMC_Stock/.env',
  },
  // Stocker — timer bilan emas, DOIMIY daemon sifatida ishlaydi (yig'ish
  // serveri, WebSocket bilan telefon/printer clientlarini kutib turadi).
  // timerUnit yo'q: panel bunda interval/to'xtatish/hozir ishga tushirish
  // o'rniga faqat "qayta ishga tushirish"ni ko'rsatadi.
  stocker: {
    serviceUnit: 'stocker-server.service',
    timerUnit: null,
    timerUnitPath: null,
    envPath: '/root/stocker/server/.env',
  },
};
