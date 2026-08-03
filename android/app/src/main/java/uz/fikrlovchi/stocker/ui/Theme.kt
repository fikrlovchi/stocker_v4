package uz.fikrlovchi.stocker.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import uz.fikrlovchi.stocker.data.ScanResult

/**
 * Ombor sharoiti uchun: to'q fon (batareya + ko'z), yirik matn, kuchli rang
 * kontrasti — natija bir metrdan ham ko'rinishi kerak. Kunduzgi tema yo'q:
 * yorug'lik o'zgarganda rang kodlari o'zgarib ketmasligi kerak.
 */
object Palette {
    val bg = Color(0xFF0F172A)
    val panel = Color(0xFF1E293B)
    val line = Color(0xFF334155)
    val text = Color(0xFFE2E8F0)
    val muted = Color(0xFF94A3B8)
    val accent = Color(0xFF3B82F6)
    val ok = Color(0xFF16A34A)
    val warn = Color(0xFFD97706)
    val err = Color(0xFFDC2626)
    val done = Color(0xFF7C3AED)
}

/** Skan natijasi -> rang va sarlavha. */
data class ResultStyle(val color: Color, val title: String)

fun resultStyle(result: String): ResultStyle = when (result) {
    ScanResult.ORDER_OPENED -> ResultStyle(Palette.accent, "BUYURTMA OCHILDI")
    ScanResult.OK -> ResultStyle(Palette.ok, "QABUL QILINDI")
    ScanResult.ORDER_COMPLETE -> ResultStyle(Palette.done, "BUYURTMA YIG'ILDI")
    ScanResult.WRONG_ITEM -> ResultStyle(Palette.err, "BOSHQA TOVAR")
    ScanResult.ALREADY_COMPLETE -> ResultStyle(Palette.warn, "TO'LIQ SKANERLANGAN")
    ScanResult.UNKNOWN_BARCODE -> ResultStyle(Palette.err, "BARCODE TOPILMADI")
    ScanResult.NO_AVAILABLE_ORDER -> ResultStyle(Palette.warn, "BUYURTMA YO'Q")
    else -> ResultStyle(Palette.muted, result.uppercase())
}

// Tizim temasi ataylab e'tiborga olinmaydi: yorug'lik o'zgarganda natija
// ranglari (yashil/qizil/sariq) o'zgarib ketmasligi kerak.
@Composable
fun StockerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Palette.accent,
            background = Palette.bg,
            surface = Palette.panel,
            onPrimary = Color.White,
            onBackground = Palette.text,
            onSurface = Palette.text,
            error = Palette.err,
        ),
        content = content,
    )
}
