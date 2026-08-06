package uz.fikrlovchi.stocker.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.fikrlovchi.stocker.BuildConfig
import uz.fikrlovchi.stocker.data.Config

/**
 * Yagona sozlamalar ekrani: hisob, til, mavzu va ish joyi.
 *
 * Ilgari bular uch joyga bo'lingan edi (kirish ekrani, QR juftlash, skan
 * ekranidagi tugmalar) — operator qayerdan nima o'zgartirishini topa olmasdi.
 */
@Composable
fun SettingsScreen(
    config: Config,
    onChange: (Config) -> Unit,
    onPairStation: () -> Unit,
    onLogout: () -> Unit,
    onBack: () -> Unit,
) {
    val p = LocalPalette.current
    val s = LocalStrings.current

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = 48.dp, bottom = 28.dp)
    ) {
        Text(s.settings, color = p.text, fontSize = 26.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        Text(s.settingsSub, color = p.muted, fontSize = 14.sp)

        /* --- Hisob --- */
        Spacer(Modifier.height(22.dp))
        Text(config.displayName, color = p.text, fontSize = 18.sp)
        Text(config.operator, color = p.muted, fontSize = 13.sp)
        Spacer(Modifier.height(10.dp))
        GhostButton(s.logout, onLogout, Modifier.fillMaxWidth(), borderColor = p.err, textColor = p.err)

        /* --- Til --- */
        Divider(p)
        Text(s.language, color = p.muted, fontSize = 13.sp)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Lang.entries.forEach { lang ->
                Chip(
                    text = lang.label,
                    selected = config.lang == lang.code,
                    onClick = { onChange(config.copy(lang = lang.code)) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        /* --- Mavzu --- */
        Divider(p)
        Text(s.theme, color = p.muted, fontSize = 13.sp)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Chip(s.themeDark, config.darkTheme, { onChange(config.copy(darkTheme = true)) }, Modifier.weight(1f))
            Chip(s.themeLight, !config.darkTheme, { onChange(config.copy(darkTheme = false)) }, Modifier.weight(1f))
        }

        /* --- Ish joyi --- */
        Divider(p)
        Text(s.station, color = p.muted, fontSize = 13.sp)
        Spacer(Modifier.height(6.dp))
        Text(
            config.stationId.ifBlank { s.stationNone },
            color = if (config.stationId.isBlank()) p.warn else p.text,
            fontSize = 18.sp,
        )
        Spacer(Modifier.height(10.dp))
        GhostButton(s.stationPair, onPairStation, Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Text(s.stationHint, color = p.muted, fontSize = 12.sp)

        Divider(p)
        Text("${s.version}: ${BuildConfig.VERSION_NAME}", color = p.muted, fontSize = 13.sp)

        Spacer(Modifier.height(24.dp))
        PrimaryButton(s.back, onBack, Modifier.fillMaxWidth())
    }
}

@Composable
private fun Divider(p: Palette) {
    Spacer(Modifier.height(20.dp))
    HorizontalDivider(color = p.line)
    Spacer(Modifier.height(16.dp))
}
