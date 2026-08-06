package uz.fikrlovchi.stocker.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Sozlamalar telefonda saqlanadi — har smena boshida qayta kiritish shart emas.
 *
 * Server manzili ATAYLAB sozlamada emas: u bitta (stocker.uz) va operator uni
 * o'zgartirishi kerak emas. Noto'g'ri yozilgan manzil ombordagi ishni to'xtatib
 * qo'yishi mumkin edi. Sinov serveri kerak bo'lsa — build variantida beriladi.
 */
const val SERVER_URL = "https://stocker.uz/pack"

data class Config(
    /** Operator tokeni (`POST /api/auth/login` dan). */
    val authToken: String = "",
    /** Operator logini — sessiyalar shu nom bilan bog'lanadi. */
    val operator: String = "",
    /** To'liq ism — ekranda ko'rsatish uchun. */
    val operatorName: String = "",
    val stationId: String = "",
    /** Skanerlash rejimi (ScanMode nomi). */
    val scanMode: String = "MIXED",
    /** Interfeys tili: "uz" yoki "ru". */
    val lang: String = "uz",
    /** Qora mavzu. Ombor sharoiti uchun standart. */
    val darkTheme: Boolean = true,
    /** Tanlangan do'kon (ochiq partiyadagi). Bo'sh — hammasi. */
    val shopId: String = "",
) {
    val isConfigured: Boolean get() = authToken.isNotBlank()

    val displayName: String get() = operatorName.ifBlank { operator }

    val baseUrl: String get() = SERVER_URL.trimEnd('/')
}

class ConfigStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("stocker", Context.MODE_PRIVATE)

    fun load(): Config = Config(
        authToken = prefs.getString(KEY_AUTH_TOKEN, "").orEmpty(),
        operator = prefs.getString(KEY_OPERATOR, "").orEmpty(),
        operatorName = prefs.getString(KEY_OPERATOR_NAME, "").orEmpty(),
        stationId = prefs.getString(KEY_STATION, "").orEmpty(),
        scanMode = prefs.getString(KEY_SCAN_MODE, Config().scanMode).orEmpty(),
        lang = prefs.getString(KEY_LANG, Config().lang).orEmpty(),
        darkTheme = prefs.getBoolean(KEY_DARK, true),
        shopId = prefs.getString(KEY_SHOP, "").orEmpty(),
    )

    fun save(config: Config) {
        prefs.edit()
            .putString(KEY_AUTH_TOKEN, config.authToken)
            .putString(KEY_OPERATOR, config.operator)
            .putString(KEY_OPERATOR_NAME, config.operatorName)
            .putString(KEY_STATION, config.stationId)
            .putString(KEY_SCAN_MODE, config.scanMode)
            .putString(KEY_LANG, config.lang)
            .putBoolean(KEY_DARK, config.darkTheme)
            .putString(KEY_SHOP, config.shopId)
            .apply()
    }

    /** Chiqish: token o'chadi, til/mavzu va ish joyi qoladi. */
    fun clearAuth(): Config {
        val next = load().copy(authToken = "", operator = "", operatorName = "", shopId = "")
        save(next)
        return next
    }

    private companion object {
        const val KEY_AUTH_TOKEN = "authToken"
        const val KEY_OPERATOR = "operator"
        const val KEY_OPERATOR_NAME = "operatorName"
        const val KEY_STATION = "stationId"
        const val KEY_SCAN_MODE = "scanMode"
        const val KEY_LANG = "lang"
        const val KEY_DARK = "darkTheme"
        const val KEY_SHOP = "shopId"
    }
}
