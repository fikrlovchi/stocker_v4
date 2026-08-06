package uz.fikrlovchi.stocker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import uz.fikrlovchi.stocker.scan.ScanMode
import uz.fikrlovchi.stocker.scan.ScannerView
import uz.fikrlovchi.stocker.util.Buzz
import uz.fikrlovchi.stocker.util.Feedback

/**
 * Ish joyini ulash: desktop client ko'rsatgan QR skanerlanadi.
 * QR ichida {"srv": "<server>", "station": "<id>"} bo'ladi
 * (desktop/src/main.js -> ipcMain.handle("pair:qr")).
 */
@Composable
fun PairScreen(
    feedback: Feedback,
    onPaired: (stationId: String, serverUrl: String?) -> Unit,
    onSkip: () -> Unit,
) {
    val p = LocalPalette.current
    val s = LocalStrings.current
    var error by remember { mutableStateOf<String?>(null) }
    // Noto'g'ri QR ketma-ket o'nlab marta o'qilmasin.
    var lastAttempt by remember { mutableLongStateOf(0L) }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        ScannerView(
            modifier = Modifier.fillMaxSize(),
            // Juftlash QR'i — boshqa formatlar bu ekranda kerak emas.
            mode = ScanMode.QR,
            onBarcode = { raw ->
                val now = System.currentTimeMillis()
                if (now - lastAttempt < 1500) return@ScannerView
                lastAttempt = now

                val parsed = runCatching {
                    Json.parseToJsonElement(raw) as? JsonObject
                }.getOrNull()
                val station = parsed?.get("station")?.jsonPrimitive?.contentOrNull

                if (station.isNullOrBlank()) {
                    feedback.buzz(Buzz.ERROR)
                    error = "Bu QR ish joyiniki emas. Kompyuterdagi Stocker Print " +
                        "ilovasida \"Telefonni ulash\" tabini oching."
                } else {
                    feedback.buzz(Buzz.OK)
                    onPaired(station, parsed["srv"]?.jsonPrimitive?.contentOrNull)
                }
            },
        )

        Column(
            Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .padding(top = 64.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.Top,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "Ish joyini ulash",
                color = p.text,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Kompyuterdagi Stocker Print ilovasida \"Telefonni ulash\" " +
                    "tabini oching va QR'ni skanerlang.",
                color = p.muted,
                fontSize = 15.sp,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(40.dp))
            Box(
                Modifier
                    .size(250.dp)
                    .border(3.dp, p.accent, RoundedCornerShape(18.dp))
            )

            error?.let {
                Spacer(Modifier.height(24.dp))
                Text(it, color = p.err, fontSize = 15.sp, textAlign = TextAlign.Center)
            }

            Spacer(Modifier.weight(1f))
            GhostButton(
                text = "Ish joyisiz davom etish",
                onClick = onSkip,
                modifier = Modifier.fillMaxWidth(),
                borderColor = p.line,
                textColor = p.text,
            )
        }
    }
}
