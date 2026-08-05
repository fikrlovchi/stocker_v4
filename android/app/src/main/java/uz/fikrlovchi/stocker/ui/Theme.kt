package uz.fikrlovchi.stocker.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import uz.fikrlovchi.stocker.data.ScanResult

/**
 * Stocker brend palitrasi (brand/README.md).
 *
 * Ombor sharoiti uchun: deyarli qora fon (batareya + ko'z), yirik matn, kuchli
 * rang kontrasti — natija bir metrdan ham ko'rinishi kerak. Kunduzgi tema yo'q:
 * yorug'lik o'zgarganda rang kodlari o'zgarib ketmasligi kerak.
 */
object Palette {
    val bg = Color(0xFF0A0A0A)      // Background
    val panel = Color(0xFF141414)   // fonning bir pog'ona ustidagi karta
    val line = Color(0xFF3A3A3A)    // Dark Gray
    val text = Color(0xFFE6E6E6)    // Light Gray
    val muted = Color(0xFF6B6B6B)   // Primary Gray
    val accent = Color(0xFF00FF8C)  // Primary Green — tugmalar, faol holat
    val accent2 = Color(0xFF00CC6A) // Accent Green

    // Skan natijalari — funksional ranglar, brenddan mustaqil. Brend yashili
    // eng ko'p uchraydigan holatga (tovar qabul qilindi) berilgan, "buyurtma
    // ochildi" esa firuzada: ikki yashilni bir metrdan farqlash qiyin bo'lardi.
    val ok = Color(0xFF00FF8C)
    val opened = Color(0xFF22D3EE)
    val done = Color(0xFFA855F7)
    val warn = Color(0xFFFFB020)
    val err = Color(0xFFFF3B30)
}

/**
 * Rangli fon ustida o'qiladigan matn rangi. Brend yashili, firuza va sariq
 * yorqin — ular ustida qora, qizil/binafsha ustida oq matn kerak. Qo'lda
 * har joyda tanlash o'rniga yorqinlik bo'yicha hisoblanadi.
 */
fun onColor(background: Color): Color =
    if (background.luminance() > 0.4f) Palette.bg else Color.White

/** Skan natijasi -> rang va sarlavha. */
data class ResultStyle(val color: Color, val title: String)

fun resultStyle(result: String): ResultStyle = when (result) {
    ScanResult.ORDER_OPENED -> ResultStyle(Palette.opened, "BUYURTMA OCHILDI")
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
            // Yashil fon ustida qora matn — oq matn o'qilmaydi.
            onPrimary = Palette.bg,
            onBackground = Palette.text,
            onSurface = Palette.text,
            error = Palette.err,
        ),
        content = content,
    )
}
