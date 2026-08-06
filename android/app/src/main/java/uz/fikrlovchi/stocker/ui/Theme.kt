package uz.fikrlovchi.stocker.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import uz.fikrlovchi.stocker.data.ScanResult

/**
 * Stocker brend palitrasi (brand/README.md).
 *
 * Ikki mavzu: qora (ombor uchun standart — batareya va ko'z) va oq (yorug'
 * xonada yoki afzal ko'rilsa). Skan natijasi ranglari IKKALASIDA HAM bir xil
 * qoladi: operator rangga qarab qaror qiladi, mavzu almashgani bilan
 * "qabul qilindi" va "xato" ranglari o'zgarmasligi kerak.
 */
data class Palette(
    val bg: Color,
    val panel: Color,
    val line: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val accent2: Color,
    // Funksional (mavzudan mustaqil)
    val ok: Color = Color(0xFF00FF8C),
    val opened: Color = Color(0xFF22D3EE),
    val done: Color = Color(0xFFA855F7),
    val warn: Color = Color(0xFFFFB020),
    val err: Color = Color(0xFFFF3B30),
)

val DarkPalette = Palette(
    bg = Color(0xFF0A0A0A),
    panel = Color(0xFF141414),
    line = Color(0xFF3A3A3A),
    text = Color(0xFFE6E6E6),
    muted = Color(0xFF6B6B6B),
    accent = Color(0xFF00FF8C),
    accent2 = Color(0xFF00CC6A),
)

val LightPalette = Palette(
    bg = Color(0xFFF4F6F5),
    panel = Color(0xFFFFFFFF),
    line = Color(0xFFD5DBD8),
    text = Color(0xFF121514),
    muted = Color(0xFF6B7370),
    // Oq fonda #00FF8C ko'zni qamashtiradi va matn o'qilmaydi — to'qroq yashil.
    accent = Color(0xFF00B866),
    accent2 = Color(0xFF009C56),
    ok = Color(0xFF00A85C),
    opened = Color(0xFF0891B2),
    done = Color(0xFF7E22CE),
    warn = Color(0xFFB26A00),
    err = Color(0xFFD62D20),
)

/** Ekranlar rangni shu yerdan oladi. */
val LocalPalette = compositionLocalOf { DarkPalette }

/**
 * Rangli fon ustida o'qiladigan matn rangi. Yorqin yashil, firuza va sariq
 * ustida qora, to'qlari ustida oq kerak — qo'lda tanlash o'rniga yorqinlik
 * bo'yicha hisoblanadi.
 */
fun onColor(background: Color): Color =
    if (background.luminance() > 0.4f) Color(0xFF0A0A0A) else Color.White

/** Skan natijasi -> rang va sarlavha. */
data class ResultStyle(val color: Color, val title: String)

fun resultStyle(result: String, p: Palette, s: Strings): ResultStyle = when (result) {
    ScanResult.ORDER_OPENED -> ResultStyle(p.opened, s.resultOpened)
    ScanResult.OK -> ResultStyle(p.ok, s.resultOk)
    ScanResult.ORDER_COMPLETE -> ResultStyle(p.done, s.resultComplete)
    ScanResult.WRONG_ITEM -> ResultStyle(p.err, s.resultWrongItem)
    ScanResult.ALREADY_COMPLETE -> ResultStyle(p.warn, s.resultAlready)
    ScanResult.UNKNOWN_BARCODE -> ResultStyle(p.err, s.resultUnknown)
    ScanResult.NO_AVAILABLE_ORDER -> ResultStyle(p.warn, s.resultNoOrder)
    else -> ResultStyle(p.muted, result.uppercase())
}

@Composable
fun StockerTheme(dark: Boolean = true, lang: Lang = Lang.UZ, content: @Composable () -> Unit) {
    val palette = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) {
        darkColorScheme(
            primary = palette.accent,
            background = palette.bg,
            surface = palette.panel,
            onPrimary = palette.bg,
            onBackground = palette.text,
            onSurface = palette.text,
            error = palette.err,
        )
    } else {
        lightColorScheme(
            primary = palette.accent,
            background = palette.bg,
            surface = palette.panel,
            onPrimary = Color.White,
            onBackground = palette.text,
            onSurface = palette.text,
            error = palette.err,
        )
    }

    CompositionLocalProvider(
        LocalPalette provides palette,
        LocalStrings provides stringsFor(lang),
    ) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
