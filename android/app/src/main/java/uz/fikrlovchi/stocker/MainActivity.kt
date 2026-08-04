package uz.fikrlovchi.stocker

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import uz.fikrlovchi.stocker.data.Api
import uz.fikrlovchi.stocker.data.Config
import uz.fikrlovchi.stocker.data.ConfigStore
import uz.fikrlovchi.stocker.ui.LoginScreen
import uz.fikrlovchi.stocker.ui.Palette
import uz.fikrlovchi.stocker.ui.PairScreen
import uz.fikrlovchi.stocker.ui.PrimaryButton
import uz.fikrlovchi.stocker.ui.ScanScreen
import uz.fikrlovchi.stocker.ui.StockerTheme
import uz.fikrlovchi.stocker.util.Feedback

private enum class Screen { LOGIN, PAIR, SCAN }

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Yig'ish paytida qo'l band — ekran o'chmasligi kerak.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val store = ConfigStore(this)
        val feedback = Feedback(this)

        setContent {
            StockerTheme {
                var config by remember { mutableStateOf(store.load()) }
                var screen by remember {
                    mutableStateOf(
                        when {
                            !store.load().isConfigured -> Screen.LOGIN
                            // Ish joyisiz yorliq chiqmaydi, shuning uchun
                            // birinchi navbatda juftlashga yuboramiz.
                            store.load().stationId.isBlank() -> Screen.PAIR
                            else -> Screen.SCAN
                        }
                    )
                }

                // Api har doim ENG YANGI config'ni o'qiydi (lambda orqali) —
                // sozlama o'zgarganda yangi Api yasash kerak emas.
                val api = remember { Api { config } }

                Box(Modifier.fillMaxSize().background(Palette.bg)) {
                    when (screen) {
                        Screen.LOGIN -> LoginScreen(
                            initial = config,
                            onLoggedIn = { saved ->
                                config = saved
                                store.save(saved)
                                screen = if (saved.stationId.isBlank()) Screen.PAIR else Screen.SCAN
                            },
                            // Allaqachon kirilgan bo'lsa (⚙ orqali kelingan) —
                            // qaytish yo'li bo'lsin.
                            onBack = if (config.isConfigured) ({ screen = Screen.SCAN }) else null,
                        )

                        Screen.PAIR -> RequireCamera {
                            PairScreen(
                                feedback = feedback,
                                onPaired = { stationId, serverUrl ->
                                    val next = config.copy(
                                        stationId = stationId,
                                        serverUrl = serverUrl?.takeIf { it.isNotBlank() } ?: config.serverUrl,
                                    )
                                    config = next
                                    store.save(next)
                                    screen = Screen.SCAN
                                },
                                onSkip = { screen = Screen.SCAN },
                            )
                        }

                        Screen.SCAN -> RequireCamera {
                            ScanScreen(
                                config = config,
                                api = api,
                                feedback = feedback,
                                onScanModeChange = { m ->
                                    val next = config.copy(scanMode = m.name)
                                    config = next
                                    store.save(next)
                                },
                                onOpenSettings = { screen = Screen.LOGIN },
                                onOpenPair = { screen = Screen.PAIR },
                                // Token kuygan (panel'da faolsizlantirilgan yoki
                                // muddati o'tgan) — saqlangan tokenni tashlab,
                                // kirish ekraniga qaytamiz.
                                onAuthExpired = {
                                    config = store.clearAuth()
                                    screen = Screen.LOGIN
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Kamera ruxsati bo'lmaguncha kamera ekranlari ko'rsatilmaydi.
 * Ruxsat so'rovi ekran ochilishi bilan bir marta chiqadi.
 */
@Composable
private fun RequireCamera(content: @Composable () -> Unit) {
    val context = LocalContext.current
    var granted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var asked by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        granted = it
    }

    LaunchedEffect(Unit) {
        if (!granted && !asked) {
            asked = true
            launcher.launch(Manifest.permission.CAMERA)
        }
    }

    if (granted) {
        content()
        return
    }

    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Kamera ruxsati kerak",
            color = Palette.text,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Barcode skanerlash uchun. Ruxsat berilmasa ilova ishlamaydi — " +
                "Sozlamalar → Ilovalar → Stocker orqali ham berish mumkin.",
            color = Palette.muted,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        PrimaryButton(
            text = "Ruxsat berish",
            onClick = { launcher.launch(Manifest.permission.CAMERA) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
