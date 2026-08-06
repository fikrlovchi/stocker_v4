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
import androidx.compose.foundation.layout.Arrangement
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
import uz.fikrlovchi.stocker.ui.HistoryScreen
import uz.fikrlovchi.stocker.ui.Lang
import uz.fikrlovchi.stocker.ui.LocalPalette
import uz.fikrlovchi.stocker.ui.LocalStrings
import uz.fikrlovchi.stocker.ui.LoginScreen
import uz.fikrlovchi.stocker.ui.PairScreen
import uz.fikrlovchi.stocker.ui.PrimaryButton
import uz.fikrlovchi.stocker.ui.ScanScreen
import uz.fikrlovchi.stocker.ui.SettingsScreen
import uz.fikrlovchi.stocker.ui.StockerTheme
import uz.fikrlovchi.stocker.util.Feedback

private enum class Screen { LOGIN, PAIR, SCAN, SETTINGS, HISTORY }

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Yig'ish paytida qo'l band — ekran o'chmasligi kerak.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val store = ConfigStore(this)
        val feedback = Feedback(this)

        setContent {
            var config by remember { mutableStateOf(store.load()) }
            var screen by remember {
                mutableStateOf(if (store.load().isConfigured) Screen.SCAN else Screen.LOGIN)
            }

            // Sozlama o'zgarganda darhol saqlanadi va butun interfeys yangi
            // til/mavzuga o'tadi.
            val update: (Config) -> Unit = { next ->
                config = next
                store.save(next)
            }

            StockerTheme(dark = config.darkTheme, lang = Lang.from(config.lang)) {
                // Api har doim ENG YANGI config'ni o'qiydi (lambda orqali).
                val api = remember { Api { config } }
                val palette = LocalPalette.current

                Box(Modifier.fillMaxSize().background(palette.bg)) {
                    when (screen) {
                        Screen.LOGIN -> LoginScreen(
                            initial = config,
                            onLoggedIn = { saved ->
                                update(saved)
                                screen = if (saved.stationId.isBlank()) Screen.PAIR else Screen.SCAN
                            },
                            onPrefs = update,
                        )

                        Screen.PAIR -> RequireCamera {
                            PairScreen(
                                feedback = feedback,
                                onPaired = { stationId, _ ->
                                    update(config.copy(stationId = stationId))
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
                                onScanModeChange = { update(config.copy(scanMode = it.name)) },
                                onShopChange = { update(config.copy(shopId = it)) },
                                onOpenSettings = { screen = Screen.SETTINGS },
                                onOpenHistory = { screen = Screen.HISTORY },
                                // Token kuygan (faolsizlantirilgan yoki muddati
                                // o'tgan) — saqlangan tokenni tashlab, kirishga.
                                onAuthExpired = {
                                    config = store.clearAuth()
                                    screen = Screen.LOGIN
                                },
                            )
                        }

                        Screen.SETTINGS -> SettingsScreen(
                            config = config,
                            onChange = update,
                            onPairStation = { screen = Screen.PAIR },
                            onLogout = {
                                config = store.clearAuth()
                                screen = Screen.LOGIN
                            },
                            onBack = { screen = Screen.SCAN },
                        )

                        Screen.HISTORY -> HistoryScreen(api = api, onBack = { screen = Screen.SCAN })
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
    val p = LocalPalette.current
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
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Kamera ruxsati kerak",
            color = p.text,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Barcode skanerlash uchun. Ruxsat berilmasa ilova ishlamaydi — " +
                "Sozlamalar → Ilovalar → Stocker orqali ham berish mumkin.",
            color = p.muted,
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
