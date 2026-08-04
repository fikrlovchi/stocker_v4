package uz.fikrlovchi.stocker.scan

import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode

/**
 * Skanerlash rejimi.
 *
 * Nega rejim tanlash kerak: ML Kit qancha kam format qidirsa, shuncha tez va
 * ishonchli o'qiydi. Aralash rejim qulay, lekin agar ombordagi tovarlarda
 * faqat shtrix-kod bo'lsa, "Shtrix" rejimi noto'g'ri o'qishni ham kamaytiradi
 * (masalan yorliqdagi QR tasodifan tushib qolmaydi).
 */
enum class ScanMode(val label: String) {
    /** Chiziqli (1D) shtrix-kodlar — tovar qutilaridagi odatiy holat. */
    BARCODE("Shtrix"),

    /** Ikki o'lchamli kodlar — QR, DataMatrix, PDF417, Aztec. */
    QR("QR"),

    /** Ikkalasi ham — o'zi aniqlaydi. */
    MIXED("Aralash");

    companion object {
        fun from(value: String?): ScanMode =
            entries.firstOrNull { it.name == value } ?: MIXED
    }
}

/** 1D formatlar — Uzum va MoySklad barcode'lari shu turlarda uchraydi. */
private val FORMATS_1D = intArrayOf(
    Barcode.FORMAT_EAN_13,
    Barcode.FORMAT_EAN_8,
    Barcode.FORMAT_UPC_A,
    Barcode.FORMAT_UPC_E,
    Barcode.FORMAT_CODE_128,
    Barcode.FORMAT_CODE_39,
    Barcode.FORMAT_CODE_93,
    Barcode.FORMAT_ITF,
    Barcode.FORMAT_CODABAR,
)

/** 2D formatlar. ShK yorlig'idagi QR ham shu yerga tushadi. */
private val FORMATS_2D = intArrayOf(
    Barcode.FORMAT_QR_CODE,
    Barcode.FORMAT_DATA_MATRIX,
    Barcode.FORMAT_PDF417,
    Barcode.FORMAT_AZTEC,
)

fun scannerOptions(mode: ScanMode): BarcodeScannerOptions {
    val formats = when (mode) {
        ScanMode.BARCODE -> FORMATS_1D
        ScanMode.QR -> FORMATS_2D
        ScanMode.MIXED -> FORMATS_1D + FORMATS_2D
    }
    // setBarcodeFormats(first, *rest) — birinchi argument alohida.
    return BarcodeScannerOptions.Builder()
        .setBarcodeFormats(formats.first(), *formats.drop(1).toIntArray())
        .build()
}
