package uz.fikrlovchi.stocker.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Sozlamalar telefonda saqlanadi — har smena boshida qayta kiritish shart emas.
 * SharedPreferences yetarli: qiymatlar oddiy va kam.
 *
 * 8-fazada `token` (umumiy SERVICE_TOKEN) o'rniga `authToken` keldi — operator
 * o'z login/paroli bilan oladigan shaxsiy token. Kalit nomi ham yangi: eski
 * o'rnatishda qolgan umumiy kalit Bearer sifatida ishlatilib, tushunarsiz 401
 * bermasin.
 */
data class Config(
    val serverUrl: String = "https://uzum.fikrlovchi.uz/pack",
    /** Operator tokeni (`POST /api/auth/login` dan). */
    val authToken: String = "",
    /** Operator logini — sessiyalar shu nom bilan bog'lanadi. */
    val operator: String = "",
    /** To'liq ism — faqat ekranda ko'rsatish uchun. */
    val operatorName: String = "",
    val stationId: String = "",
    /** Skanerlash rejimi (ScanMode nomi) — operator tanlovi saqlanadi. */
    val scanMode: String = "MIXED",
) {
    val isConfigured: Boolean
        get() = serverUrl.isNotBlank() && authToken.isNotBlank()

    /** Sarlavhada ko'rinadigan nom. */
    val displayName: String get() = operatorName.ifBlank { operator }

    /** Oxiridagi `/` olib tashlanadi — yo'llar `/api/...` shaklida qo'shiladi. */
    val baseUrl: String get() = serverUrl.trimEnd('/')
}

class ConfigStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("stocker", Context.MODE_PRIVATE)

    fun load(): Config = Config(
        serverUrl = prefs.getString(KEY_SERVER, Config().serverUrl).orEmpty(),
        authToken = prefs.getString(KEY_AUTH_TOKEN, "").orEmpty(),
        operator = prefs.getString(KEY_OPERATOR, "").orEmpty(),
        operatorName = prefs.getString(KEY_OPERATOR_NAME, "").orEmpty(),
        stationId = prefs.getString(KEY_STATION, "").orEmpty(),
        scanMode = prefs.getString(KEY_SCAN_MODE, Config().scanMode).orEmpty(),
    )

    fun save(config: Config) {
        prefs.edit()
            .putString(KEY_SERVER, config.serverUrl)
            .putString(KEY_AUTH_TOKEN, config.authToken)
            .putString(KEY_OPERATOR, config.operator)
            .putString(KEY_OPERATOR_NAME, config.operatorName)
            .putString(KEY_STATION, config.stationId)
            .putString(KEY_SCAN_MODE, config.scanMode)
            .apply()
    }

    /** Chiqish: token o'chadi, server manzili va ish joyi qoladi. */
    fun clearAuth(): Config {
        val next = load().copy(authToken = "", operator = "", operatorName = "")
        save(next)
        return next
    }

    private companion object {
        const val KEY_SERVER = "serverUrl"
        const val KEY_AUTH_TOKEN = "authToken"
        const val KEY_OPERATOR = "operator"
        const val KEY_OPERATOR_NAME = "operatorName"
        const val KEY_STATION = "stationId"
        const val KEY_SCAN_MODE = "scanMode"
    }
}
