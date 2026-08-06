package uz.fikrlovchi.stocker.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Server bilan aloqa.
 *
 * Autentifikatsiya (8-faza): operator o'z login/paroli bilan token oladi va u
 * `Authorization: Bearer ...` sarlavhasida yuriladi. Operator nomi so'rov
 * tanasida uzatilmaydi — server uni tokendan biladi.
 */
class ApiException(
    message: String,
    val status: Int? = null,
    /** true — server javob bermadi (tarmoq/timeout). Bu server xatosi EMAS. */
    val offline: Boolean = false,
) : Exception(message) {
    /** Token yaroqsiz/eskirgan — qayta login qilish kerak. */
    val authExpired: Boolean get() = status == 401
}

class Api(private val config: () -> Config) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()

    // Serverga yangi maydon qo'shilsa ilova buzilmasin.
    private val json = Json { ignoreUnknownKeys = true }

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private suspend fun call(path: String, body: JsonObject? = null): String =
        withContext(Dispatchers.IO) {
            val cfg = config()
            val request = Request.Builder()
                .url(cfg.baseUrl + path)
                .apply { if (cfg.authToken.isNotBlank()) header("Authorization", "Bearer " + cfg.authToken) }
                .apply {
                    if (body != null) post(body.toString().toRequestBody(jsonType))
                }
                .build()

            val response = try {
                client.newCall(request).execute()
            } catch (e: IOException) {
                // Tarmoq uzilishi — ilova buni sariq "ULANISH YO'Q" tasmasi
                // sifatida ko'rsatadi, qizil "xato" emas.
                throw ApiException("Serverga ulanib bo'lmadi", offline = true)
            }

            response.use {
                val text = it.body?.string().orEmpty()
                if (!it.isSuccessful) {
                    val fromServer = serverError(text)
                    val message = when {
                        fromServer != null -> fromServer
                        it.code == 401 -> "Sessiya tugagan — qayta kiring"
                        else -> "Server xatosi (HTTP ${it.code})"
                    }
                    throw ApiException(message, status = it.code)
                }
                text
            }
        }

    /** Server xatolarni `{"error":"..."}` shaklida qaytaradi. */
    private fun serverError(text: String): String? = runCatching {
        (json.parseToJsonElement(text) as? JsonObject)
            ?.get("error")?.jsonPrimitive?.contentOrNull
    }.getOrNull()

    private fun urlEncode(value: String): String = URLEncoder.encode(value, "UTF-8")

    suspend fun health(): HealthResponse =
        json.decodeFromString(call("/health"))

    /** Login. Token hali yo'q — sarlavha ham qo'yilmaydi. */
    suspend fun login(login: String, password: String, device: String): LoginResponse {
        val body = buildJsonObject {
            put("login", login)
            put("password", password)
            put("device", device)
        }
        return json.decodeFromString(call("/api/auth/login", body))
    }

    /** Token hali yaroqlimi (ilova ochilganda tekshiriladi). */
    suspend fun me(): LoginResponse =
        json.decodeFromString(call("/api/auth/me"))

    suspend fun logout() {
        call("/api/auth/logout", buildJsonObject { })
    }

    suspend fun scan(barcode: String): ScanResponse {
        val cfg = config()
        val body = buildJsonObject {
            put("barcode", barcode)
            if (cfg.stationId.isNotBlank()) put("stationId", cfg.stationId)
        }
        return json.decodeFromString(call("/api/scan", body))
    }

    /** Ochiq partiyadagi do'konlar va ularda qolgan buyurtmalar soni. */
    suspend fun shops(): ShopsResponse =
        json.decodeFromString(call("/api/shops"))

    /**
     * BIG yorlig'ini chiqarish ("Print" tugmasi). Buyurtma to'liq
     * skanerlanmagan bo'lsa server 409 qaytaradi.
     */
    suspend fun printBig(sessionId: String): PrintResponse {
        val body = buildJsonObject { put("sessionId", sessionId) }
        return json.decodeFromString(call("/api/session/print", body))
    }

    /** Operator yig'gan buyurtmalar tarixi. */
    suspend fun myPacked(): PackedResponse =
        json.decodeFromString(call("/api/my-packed?limit=50"))

    /** `last=1` — buyurtma yig'ilib bo'lgach ham oxirgi sessiya ko'rinadi
     *  (yorliqni qayta chiqarish uchun kerak). Operator tokendan aniqlanadi. */
    suspend fun session(): Session =
        json.decodeFromString(call("/api/session?last=1"))

    suspend fun cancelSession(reason: String): Session {
        val body = buildJsonObject { put("reason", reason) }
        return json.decodeFromString(call("/api/session/cancel", body))
    }

    suspend fun jobs(sessionId: String): JobsResponse =
        json.decodeFromString(call("/api/jobs?sessionId=${urlEncode(sessionId)}"))

    suspend fun reprint(jobId: String): PrintJob {
        val cfg = config()
        val body = buildJsonObject {
            put("jobId", jobId)
            if (cfg.stationId.isNotBlank()) put("stationId", cfg.stationId)
        }
        return json.decodeFromString(call("/api/reprint", body))
    }
}
