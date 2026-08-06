package uz.fikrlovchi.stocker.ui

import android.os.Build
import androidx.compose.foundation.Image
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
 * Kirish ekrani: faqat login va parol.
 *
 * Server manzili maydoni ATAYLAB yo'q — u bitta va Config.kt da qattiq
 * yozilgan. Til va mavzu shu ekranda ham almashtiriladi: operator ilovaga
 * kirishdan oldin o'z tilini tanlay olsin.
 */
@Composable
fun LoginScreen(
    initial: Config,
    onLoggedIn: (Config) -> Unit,
    onPrefs: (Config) -> Unit,
) {
    val p = LocalPalette.current
    val s = LocalStrings.current

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
            .padding(top = 56.dp, bottom = 32.dp)
    ) {
        Image(
            painter = painterResource(R.drawable.logo_wordmark),
            contentDescription = "Stocker",
            modifier = Modifier.height(38.dp),
        )
        Spacer(Modifier.height(6.dp))
        Text("${s.loginSub}  ·  v${BuildConfig.VERSION_NAME}", color = p.muted, fontSize = 15.sp)

        Field(s.login, login, { login = it }, placeholder = "operator1")
        Field(s.password, password, { password = it }, secret = true)

        error?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = p.err, fontSize = 15.sp)
        }

        Spacer(Modifier.height(24.dp))
        PrimaryButton(
            text = s.signIn,
            modifier = Modifier.fillMaxWidth(),
            loading = busy,
            onClick = {
                error = null
                val user = login.trim().lowercase()
                if (user.isBlank() || password.isBlank()) {
                    error = s.fillBoth
                    return@PrimaryButton
                }
                busy = true
                scope.launch {
                    // Tokensiz Api: login so'rovi sarlavhasiz ketadi.
                    val probe = Config()
                    runCatching { Api { probe }.login(user, password, Build.MODEL ?: "android") }
                        .onSuccess { res ->
                            onLoggedIn(
                                initial.copy(
                                    authToken = res.token,
                                    operator = res.login,
                                    operatorName = res.displayName,
                                )
                            )
                        }
                        .onFailure { error = it.message ?: "?" }
                    busy = false
                }
            },
        )

        // Til va mavzu — kirishdan oldin ham kerak bo'ladi.
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Lang.entries.forEach { lang ->
                Chip(
                    text = lang.label,
                    selected = initial.lang == lang.code,
                    onClick = { onPrefs(initial.copy(lang = lang.code)) },
                    modifier = Modifier.weight(1f),
                )
            }
            Chip(
                text = if (initial.darkTheme) s.themeLight else s.themeDark,
                selected = false,
                onClick = { onPrefs(initial.copy(darkTheme = !initial.darkTheme)) },
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(Modifier.height(20.dp))
        Text(s.loginHint, color = p.muted, fontSize = 13.sp)
    }
}
