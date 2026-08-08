package uz.fikrlovchi.stocker.ui

import androidx.compose.runtime.compositionLocalOf

/**
 * O'zbek va rus tillari.
 *
 * Android resurslari (`values-ru/strings.xml`) o'rniga oddiy Kotlin xaritasi:
 * til ilovaning o'z sozlamasidan almashadi va **darhol** ta'sir qilishi kerak.
 * Resurslar bilan buning uchun Activity'ni qayta yaratish kerak bo'lardi.
 */
enum class Lang(val code: String, val label: String) {
    UZ("uz", "O'zbekcha"),
    RU("ru", "Русский");

    companion object {
        fun from(code: String?) = entries.firstOrNull { it.code == code } ?: UZ
    }
}

data class Strings(
    val appName: String = "Stocker",

    // Kirish
    val loginTitle: String,
    val loginSub: String,
    val login: String,
    val password: String,
    val signIn: String,
    val loginHint: String,
    val fillBoth: String,

    // Skan ekrani
    val chooseShop: String,
    val allShops: String,
    val noBatch: String,
    val noStation: String,
    val print: String,
    val printReady: String,
    val printSent: String,
    val printNotComplete: String,
    val reprint: String,
    val reprintChoose: String,
    val reprintShk: String,
    val reprintBig: String,
    val reprintBoth: String,
    val reprintNoSession: String,
    val printShk: String,
    val printShkSent: String,
    val printShkNothing: String,
    val otherShop: String,
    val cancelSession: String,
    val cancelConfirm: String,
    val offline: String,
    val modeBarcode: String,
    val modeQr: String,
    val modeMixed: String,

    // Natijalar
    val resultOpened: String,
    val resultOk: String,
    val resultComplete: String,
    val resultWrongItem: String,
    val resultAlready: String,
    val resultUnknown: String,
    val resultNoOrder: String,

    // Sozlamalar
    val settings: String,
    val settingsSub: String,
    val language: String,
    val theme: String,
    val themeDark: String,
    val themeLight: String,
    val station: String,
    val stationPair: String,
    val stationNone: String,
    val stationHint: String,
    val logout: String,
    val version: String,
    val back: String,

    // Tarix
    val history: String,
    val historyEmpty: String,
    val historyItems: String,
)

private val UZ = Strings(
    loginTitle = "Kirish",
    loginSub = "Yig'ish ilovasi",
    login = "Login",
    password = "Parol",
    signIn = "Kirish",
    loginHint = "Login va parolni admin beradi (Foydalanuvchilar bo'limi).",
    fillBoth = "Login va parolni kiriting",

    chooseShop = "Do'kon tanlang",
    allShops = "Hammasi",
    noBatch = "Ochiq partiya yo'q",
    noStation = "ish joyi ulanmagan",
    print = "PRINT",
    printReady = "Yorliqni chiqarish",
    printSent = "Yorliq chop etishga yuborildi",
    printNotComplete = "Avval barcha tovarlarni skanerlang",
    reprint = "Qayta chiqarish",
    reprintChoose = "Qaysi yorliq qayta chiqarilsin?",
    reprintShk = "Faqat ShK",
    reprintBig = "Faqat BIG",
    reprintBoth = "Ikkalasi",
    reprintNoSession = "Bu yozuv uchun sessiya topilmadi",
    printShk = "ShK chiqarish",
    printShkSent = "yorliq yuborildi",
    printShkNothing = "Yangi yorliq yo'q — hammasi chiqarilgan",
    otherShop = "Bu tovar boshqa do'konda",
    cancelSession = "Bekor qilish",
    cancelConfirm = "Yig'ishni bekor qilasizmi?",
    offline = "Serverga ulanib bo'lmayapti — qayta urinilmoqda",
    modeBarcode = "Shtrix",
    modeQr = "QR",
    modeMixed = "Aralash",

    resultOpened = "BUYURTMA OCHILDI",
    resultOk = "QABUL QILINDI",
    resultComplete = "BUYURTMA YIG'ILDI",
    resultWrongItem = "BOSHQA TOVAR",
    resultAlready = "TO'LIQ SKANERLANGAN",
    resultUnknown = "BARCODE TOPILMADI",
    resultNoOrder = "BUYURTMA YO'Q",

    settings = "Sozlamalar",
    settingsSub = "Hisob, til, ko'rinish va ish joyi",
    language = "Til",
    theme = "Mavzu",
    themeDark = "Qora",
    themeLight = "Oq",
    station = "Ish joyi",
    stationPair = "QR orqali ulash",
    stationNone = "ulanmagan",
    stationHint = "Ish joyi ulanmasa yorliqlar navbatda kutib qoladi va chop etilmaydi.",
    logout = "Chiqish",
    version = "Versiya",
    back = "Orqaga",

    history = "Men yig'ganlarim",
    historyEmpty = "Hozircha yig'ilgan buyurtma yo'q",
    historyItems = "tovar",
)

private val RU = Strings(
    loginTitle = "Вход",
    loginSub = "Приложение сборки",
    login = "Логин",
    password = "Пароль",
    signIn = "Войти",
    loginHint = "Логин и пароль выдаёт админ (раздел «Пользователи»).",
    fillBoth = "Введите логин и пароль",

    chooseShop = "Выберите магазин",
    allShops = "Все",
    noBatch = "Нет открытой партии",
    noStation = "рабочее место не подключено",
    print = "PRINT",
    printReady = "Напечатать этикетку",
    printSent = "Этикетка отправлена на печать",
    printNotComplete = "Сначала отсканируйте все товары",
    reprint = "Повторная печать",
    reprintChoose = "Какую этикетку напечатать заново?",
    reprintShk = "Только ШК",
    reprintBig = "Только BIG",
    reprintBoth = "Обе",
    reprintNoSession = "Для этой записи сессия не найдена",
    printShk = "Печать ШК",
    printShkSent = "этикеток отправлено",
    printShkNothing = "Новых этикеток нет — всё напечатано",
    otherShop = "Этот товар в другом магазине",
    cancelSession = "Отменить",
    cancelConfirm = "Отменить сборку?",
    offline = "Нет связи с сервером — повторяем попытку",
    modeBarcode = "Штрих",
    modeQr = "QR",
    modeMixed = "Смешанный",

    resultOpened = "ЗАКАЗ ОТКРЫТ",
    resultOk = "ПРИНЯТО",
    resultComplete = "ЗАКАЗ СОБРАН",
    resultWrongItem = "ДРУГОЙ ТОВАР",
    resultAlready = "УЖЕ ОТСКАНИРОВАН",
    resultUnknown = "ШТРИХКОД НЕ НАЙДЕН",
    resultNoOrder = "НЕТ ЗАКАЗА",

    settings = "Настройки",
    settingsSub = "Аккаунт, язык, вид и рабочее место",
    language = "Язык",
    theme = "Тема",
    themeDark = "Тёмная",
    themeLight = "Светлая",
    station = "Рабочее место",
    stationPair = "Подключить по QR",
    stationNone = "не подключено",
    stationHint = "Без рабочего места этикетки останутся в очереди и не напечатаются.",
    logout = "Выйти",
    version = "Версия",
    back = "Назад",

    history = "Мои сборки",
    historyEmpty = "Пока нет собранных заказов",
    historyItems = "товар(ов)",
)

fun stringsFor(lang: Lang): Strings = if (lang == Lang.RU) RU else UZ

/** Ekranlar `LocalStrings.current` orqali oladi — har joyga uzatish shart emas. */
val LocalStrings = compositionLocalOf { UZ }
