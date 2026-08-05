package uz.fikrlovchi.stocker.ui

import android.os.Build
import androidx.compose.foundation.Image
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uz.fikrlovchi.stocker.BuildConfig
import uz.fikrlovchi.stocker.R
import uz.fikrlovchi.stocker.data.Api
import uz.fikrlovchi.stocker.data.Config

/**
 * Kirish ekrani (8-faza): server manzili + operator login/paroli.
 *
 * Operatorlar fikrlovchi-panel'da yaratiladi, stocker-server esa ro'yxatni
 * o'zida keshlab tekshiradi. Token telefonda saqlanadi — har smenada qayta
 * kiritish shart emas, lekin panel'da hisob faolsizlantirilsa token darhol
 * kuyadi va shu ekran qaytadi.
 *
 * Bu ekran sozlama ekrani ham: ⚙ tugmasidan kelinganda server manzilini
 * o'zgartirib, boshqa operator sifatida kirish mumkin.
 */
@Composable
fun LoginScreen(
    initial: Config,
    onLoggedIn: (Config) -> Unit,
    onBack: (() -> Unit)? = null,
) {
    var serverUrl by remember { mutableStateOf(initial.serverUrl) }
    var login by remember { mutableStateOf(initial.operator) }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp)
            .padding(top = 64.dp, bottom = 32.dp)
    ) {
        // Yozuvli logotip (brand/logo-text.png dan yasalgan, foni shaffof) —
        // panel va desktop client'da ham xuddi shu joyda: yuqori chapda.
        Image(
            painter = painterResource(R.drawable.logo_wordmark),
            contentDescription = "Stocker",
            modifier = Modifier.height(38.dp),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Yig'ish ilovasi — kirish  ·  v${BuildConfig.VERSION_NAME}",
            color = Palette.muted,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(16.dp))

        Field(
            label = "Server manzili",
            value = serverUrl,
            onValueChange = { serverUrl = it },
            placeholder = "https://stocker.uz/pack",
        )
        Field(
            label = "Login",
            value = login,
            onValueChange = { login = it },
            placeholder = "masalan: operator1",
        )
        Field(
            label = "Parol",
            value = password,
            onValueChange = { password = it },
            placeholder = "panel'da berilgan parol",
            secret = true,
        )

        error?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = Palette.err, fontSize = 15.sp)
        }

        Spacer(Modifier.height(28.dp))
        PrimaryButton(
            text = "Kirish",
            modifier = Modifier.fillMaxWidth(),
            loading = busy,
            onClick = {
                error = null
                val url = serverUrl.trim()
                val user = login.trim().lowercase()
                if (url.isBlank() || user.isBlank() || password.isBlank()) {
                    error = "Uchala maydon ham to'ldirilishi kerak"
                    return@PrimaryButton
                }
                busy = true
                scope.launch {
                    // Tokensiz Api: login so'rovi sarlavhasiz ketadi.
                    val probe = Config(serverUrl = url)
                    runCatching { Api { probe }.login(user, password, Build.MODEL ?: "android") }
                        .onSuccess { res ->
                            onLoggedIn(
                                initial.copy(
                                    serverUrl = url,
                                    authToken = res.token,
                                    operator = res.login,
                                    operatorName = res.displayName,
                                )
                            )
                        }
                        .onFailure { error = it.message ?: "Kirib bo'lmadi" }
                    busy = false
                }
            },
        )

        if (onBack != null) {
            Spacer(Modifier.height(12.dp))
            GhostButton("Bekor qilish", onBack, Modifier.fillMaxWidth())
        }

        Spacer(Modifier.height(24.dp))
        Text(
            "Login va parolni panel beradi (loyiha sahifasi → Operatorlar). Ish joyi " +
                "(printer) keyingi ekranda QR orqali ulanadi — ulanmasa yorliqlar navbatda " +
                "kutib qoladi va chop etilmaydi.",
            color = Palette.muted,
            fontSize = 13.sp,
        )
    }
}
