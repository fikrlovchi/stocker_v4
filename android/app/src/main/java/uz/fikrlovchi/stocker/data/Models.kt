package uz.fikrlovchi.stocker.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Server javoblari. `ignoreUnknownKeys = true` bilan o'qiladi (Api.kt),
 * shuning uchun serverga yangi maydon qo'shilsa ilova buzilmaydi.
 */

@Serializable
data class Progress(
    val scanned: Int = 0,
    val total: Int = 0,
    val remaining: Int = 0,
)

@Serializable
data class SessionItem(
    val itemId: String,
    val skuTitle: String? = null,
    val mcName: String? = null,
    val needed: Int = 0,
    val scanned: Int = 0,
    val remaining: Int = 0,
) {
    /** Ekranda ko'rsatiladigan asosiy nom — MoySklad nomi ustuvor. */
    val displayName: String get() = mcName?.takeIf { it.isNotBlank() } ?: skuTitle.orEmpty()
}

@Serializable
data class Session(
    val id: String,
    val orderId: String,
    val operator: String? = null,
    val stationId: String? = null,
    val status: String = "active",
    val progress: Progress = Progress(),
    val items: List<SessionItem> = emptyList(),
) {
    val isClosed: Boolean get() = status != "active"
    val percent: Int get() = if (progress.total > 0) progress.scanned * 100 / progress.total else 0
}

@Serializable
data class PrintJob(
    val id: String,
    val orderId: String,
    val target: String,
    val copies: Int = 1,
    val status: String = "pending",
)

@Serializable
data class JobsResponse(val jobs: List<PrintJob> = emptyList())

@Serializable
data class ScanResponse(
    val result: String,
    val message: String? = null,
    val session: Session? = null,
)

/** `GET /api/shops` — ochiq partiyadagi do'konlar va qoldiq. */
@Serializable
data class Shop(
    val shopId: String,
    val total: Int = 0,
    val packed: Int = 0,
    val pending: Int = 0,
)

@Serializable
data class BatchInfo(
    val id: Int,
    val name: String,
    val total: Int = 0,
    val packed: Int = 0,
)

@Serializable
data class ShopsResponse(
    val batch: BatchInfo? = null,
    val shops: List<Shop> = emptyList(),
)

/** `GET /api/my-packed` — operator yig'gan buyurtmalar. */
@Serializable
data class PackedItem(
    val itemId: String,
    val title: String = "",
    val needed: Int = 0,
    val scanned: Int = 0,
)

@Serializable
data class PackedOrder(
    val orderId: String,
    val stationId: String? = null,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val batch: String? = null,
    val items: List<PackedItem> = emptyList(),
)

@Serializable
data class PackedResponse(val orders: List<PackedOrder> = emptyList())

/** `POST /api/session/print` javobi. */
@Serializable
data class PrintResponse(
    val ok: Boolean = false,
    val reused: Boolean = false,
    val jobs: List<PrintJob> = emptyList(),
)

/** `POST /api/auth/login` javobi. */
@Serializable
data class LoginResponse(
    val token: String,
    val login: String,
    val displayName: String = "",
)

@Serializable
data class HealthResponse(
    val ok: Boolean = false,
    @SerialName("eligibleOrders") val eligibleOrders: Int? = null,
)

/** Skan natijalari — server RESULT kodlari (PLAN.md 4-bo'lim). */
object ScanResult {
    const val ORDER_OPENED = "order_opened"
    const val OK = "ok"
    const val ORDER_COMPLETE = "order_complete"
    const val WRONG_ITEM = "wrong_item"
    const val ALREADY_COMPLETE = "already_complete"
    const val UNKNOWN_BARCODE = "unknown_barcode"
    const val NO_AVAILABLE_ORDER = "no_available_order"
}
