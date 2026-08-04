package uz.fikrlovchi.stocker.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uz.fikrlovchi.stocker.BuildConfig
import uz.fikrlovchi.stocker.data.Api
import uz.fikrlovchi.stocker.data.Config

/**
 * Sozlash: server, kalit, operator ismi.
 *
 * 8-fazada bu ekran login (foydalanuvchi nomi + parol) bilan almashadi —
 * kalit o'rniga JWT olinadi. Boshqa ekranlar tegilmaydi.
 */
@Composable
fun SetupScreen(
    initial: Config,
    onSaved: (Config) -> Unit,
) {
    var serverUrl by remember { mutableStateOf(initial.serverUrl) }
    var token by remember { mutableStateOf(initial.token) }
    var operator by remember { mutableStateOf(initial.operator) }
    var error by remember { mutableStateOf<String?>(null) }
    var checking by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp)
            .padding(top = 64.dp, bottom = 32.dp)
    ) {
        Text("Stocker", color = Palette.text, fontSize = 34.sp, fontWeight = FontWeight.Bold)
        Text(
            "Yig'ish ilovasi — sozlash  ·  v${BuildConfig.VERSION_NAME}",
            color = Palette.muted,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(16.dp))

        Field(
            label = "Server manzili",
            value = serverUrl,
            onValueChange = { serverUrl = it },
            placeholder = "https://uzum.fikrlovchi.uz/pack",
        )
        Field(
            label = "Kalit",
            value = token,
            onValueChange = { token = it },
            placeholder = "serverdagi SERVICE_TOKEN",
            secret = true,
        )
        Field(
            label = "Operator",
            value = operator,
            onValueChange = { operator = it },
            placeholder = "ismingiz (masalan: aziz)",
        )

        error?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = Palette.err, fontSize = 15.sp)
        }

        Spacer(Modifier.height(28.dp))
        PrimaryButton(
            text = "Tekshirish va saqlash",
            modifier = Modifier.fillMaxWidth(),
            loading = checking,
            onClick = {
                error = null
                val candidate = Config(
                    serverUrl = serverUrl.trim(),
                    token = token.trim(),
                    operator = operator.trim(),
                    stationId = initial.stationId,
                )
                if (!candidate.isConfigured) {
                    error = "Uchala maydon ham to'ldirilishi kerak"
                    return@PrimaryButton
                }
                checking = true
                scope.launch {
                    // Saqlashdan oldin ulanishni tekshiramiz — noto'g'ri
                    // sozlama bilan skan ekraniga o'tib, keyin har skanda
                    // xato ko'rgandan yaxshiroq.
                    runCatching { Api { candidate }.health() }
                        .onSuccess { onSaved(candidate) }
                        .onFailure { error = it.message ?: "Ulanib bo'lmadi" }
                    checking = false
                }
            },
        )

        Spacer(Modifier.height(24.dp))
        Text(
            "Ish joyi (printer) keyingi ekranda QR orqali ulanadi. Ulanmasa " +
                "yorliqlar navbatda kutib qoladi va chop etilmaydi.",
            color = Palette.muted,
            fontSize = 13.sp,
        )
    }
}
