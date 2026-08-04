package uz.fikrlovchi.stocker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uz.fikrlovchi.stocker.data.Api
import uz.fikrlovchi.stocker.data.ApiException
import uz.fikrlovchi.stocker.data.Config
import uz.fikrlovchi.stocker.data.PrintJob
import uz.fikrlovchi.stocker.data.ScanResult
import uz.fikrlovchi.stocker.data.Session
import uz.fikrlovchi.stocker.scan.ScanMode
import uz.fikrlovchi.stocker.scan.ScannerView
import uz.fikrlovchi.stocker.util.Buzz
import uz.fikrlovchi.stocker.util.Feedback

/**
 * Kamera bir barcode'ni sekundiga o'nlab marta beradi — bir xil kodni shu
 * muddat ichida takror hisoblamaymiz. Busiz bitta tovar bir necha marta
 * skanerlangan bo'lib qolardi.
 */
private const val SAME_CODE_COOLDOWN_MS = 2500L
private const val BANNER_MS = 3500L

private data class Banner(val color: Color, val title: String, val message: String)

@Composable
fun ScanScreen(
    config: Config,
    api: Api,
    feedback: Feedback,
    onScanModeChange: (ScanMode) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenPair: () -> Unit,
) {
    var session by remember { mutableStateOf<Session?>(null) }
    var banner by remember { mutableStateOf<Banner?>(null) }
    var busy by remember { mutableStateOf(false) }
    var offline by remember { mutableStateOf(false) }

    // Rejim sozlamalarda saqlanadi; chiroq esa sessiya davomida — smena
    // oxirida yoqilgan holda qolib batareyani yeb qo'ymasin.
    val mode = ScanMode.from(config.scanMode)
    var torchOn by remember { mutableStateOf(false) }
    var torchAvailable by remember { mutableStateOf(false) }

    var manualOpen by remember { mutableStateOf(false) }
    var manualValue by remember { mutableStateOf("") }
    var confirmCancel by remember { mutableStateOf(false) }
    var reprintJobs by remember { mutableStateOf<List<PrintJob>?>(null) }

    var lastCode by remember { mutableStateOf("") }
    var lastCodeAt by remember { mutableLongStateOf(0L) }
    var bannerAt by remember { mutableLongStateOf(0L) }

    val scope = rememberCoroutineScope()

    fun showBanner(result: String, message: String?) {
        val style = resultStyle(result)
        banner = Banner(style.color, style.title, message.orEmpty())
        bannerAt = System.currentTimeMillis()
        feedback.buzz(
            when (result) {
                ScanResult.OK, ScanResult.ORDER_OPENED -> Buzz.OK
                ScanResult.ORDER_COMPLETE -> Buzz.DONE
                ScanResult.WRONG_ITEM, ScanResult.UNKNOWN_BARCODE -> Buzz.ERROR
                else -> Buzz.WARN
            }
        )
    }

    // Banner o'zi yo'qoladi.
    LaunchedEffect(bannerAt) {
        if (bannerAt == 0L) return@LaunchedEffect
        kotlinx.coroutines.delay(BANNER_MS)
        if (System.currentTimeMillis() - bannerAt >= BANNER_MS) banner = null
    }

    // Sessiya SERVERDA saqlanadi — ilova yopilib ochilsa yoki telefon
    // internetni yo'qotib qayta ulansa, yig'ish joyidan davom etadi.
    LaunchedEffect(config.operator) {
        runCatching { api.session() }
            .onSuccess { session = it; offline = false }
            .onFailure { e ->
                if (e is ApiException && e.status == 404) session = null
                else if (e is ApiException) offline = e.offline
            }
    }

    fun submit(barcode: String) {
        val code = barcode.trim()
        if (code.isEmpty() || busy) return
        busy = true
        scope.launch {
            runCatching { api.scan(code) }
                .onSuccess { r ->
                    offline = false
                    r.session?.let { session = it }
                    showBanner(r.result, r.message)
                }
                .onFailure { e ->
                    feedback.buzz(Buzz.ERROR)
                    val apiErr = e as? ApiException
                    offline = apiErr?.offline == true
                    banner = Banner(
                        Palette.err,
                        if (apiErr?.offline == true) "ULANISH YO'Q" else "XATO",
                        e.message.orEmpty(),
                    )
                    bannerAt = System.currentTimeMillis()
                }
            busy = false
        }
    }

    Column(Modifier.fillMaxSize().background(Palette.bg)) {

        /* ---------- Sarlavha ---------- */
        Row(
            Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 52.dp, bottom = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(config.operator, color = Palette.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    if (config.stationId.isNotBlank()) "📍 ${config.stationId}" else "⚠ ish joyi ulanmagan",
                    color = if (config.stationId.isNotBlank()) Palette.muted else Palette.warn,
                    fontSize = 13.sp,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GhostButton("QR", onOpenPair, Modifier.size(width = 62.dp, height = 44.dp))
                GhostButton("⚙", onOpenSettings, Modifier.size(width = 56.dp, height = 44.dp))
            }
        }

        if (offline) {
            Text(
                "Serverga ulanib bo'lmayapti — qayta urinilmoqda",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.fillMaxWidth().background(Palette.warn).padding(vertical = 7.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }

        /* ---------- Kamera ---------- */
        // clipToBounds: kamera view'i qutidan chiqib ketmasin (ScannerView
        // izohiga qarang — SurfaceView bilan aynan shunday bo'lgan edi).
        Box(
            Modifier
                .fillMaxWidth()
                .height(250.dp)
                .clipToBounds()
                .background(Color.Black)
        ) {
            ScannerView(
                modifier = Modifier.fillMaxSize(),
                mode = mode,
                torchOn = torchOn,
                paused = busy,
                onTorchAvailable = { torchAvailable = it },
                onBarcode = { code ->
                    val now = System.currentTimeMillis()
                    if (code == lastCode && now - lastCodeAt < SAME_CODE_COOLDOWN_MS) return@ScannerView
                    lastCode = code
                    lastCodeAt = now
                    submit(code)
                },
            )

            // Nishon: QR rejimida kvadrat, shtrix rejimida cho'ziq — operator
            // kodni qanday tutish kerakligini ko'rsatadi.
            Box(
                Modifier
                    .align(Alignment.Center)
                    .then(
                        if (mode == ScanMode.QR) Modifier.size(160.dp)
                        else Modifier.size(width = 230.dp, height = 130.dp)
                    )
                    .border(3.dp, Color(0xBFFFFFFF), RoundedCornerShape(14.dp))
            )

            // Chiroq — yuqori o'ngda
            if (torchAvailable) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(10.dp)
                        .size(44.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(if (torchOn) Palette.accent else Color(0x8C000000))
                        .clickable { torchOn = !torchOn },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("🔦", fontSize = 20.sp)
                }
            }

            // Rejim tanlash — pastda
            Row(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 10.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x8C000000))
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                ScanMode.entries.forEach { m ->
                    val active = m == mode
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (active) Palette.accent else Color.Transparent)
                            .clickable { if (!active) onScanModeChange(m) }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(
                            m.label,
                            color = if (active) Color.White else Color(0xFFCBD5E1),
                            fontSize = 13.sp,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            }

            if (busy) {
                Box(
                    Modifier.fillMaxSize().background(Color(0x73000000)),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator(color = Color.White) }
            }
        }

        /* ---------- Natija banneri ---------- */
        banner?.let { b ->
            Column(Modifier.fillMaxWidth().background(b.color).padding(horizontal = 18.dp, vertical = 16.dp)) {
                Text(b.title, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                if (b.message.isNotBlank()) {
                    Text(b.message, color = Color(0xEBFFFFFF), fontSize = 15.sp)
                }
            }
        }

        /* ---------- Sessiya ---------- */
        // weight(1f): kamera va banner o'z balandligini oladi, qolgan joy
        // aylantiriladigan qismga tegadi (fillMaxSize bo'lsa cheksiz
        // balandlik so'rab layout buzilardi).
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            val s = session
            if (s != null) {
                Column(
                    Modifier
                        .padding(16.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Palette.panel)
                        .border(1.dp, Palette.line, RoundedCornerShape(14.dp))
                        .padding(16.dp)
                ) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Text(s.orderId, color = Palette.text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "${s.progress.scanned} / ${s.progress.total}",
                            color = if (s.isClosed) Palette.done else Palette.text,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    Box(
                        Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(Palette.line)
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth(s.percent / 100f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (s.isClosed) Palette.done else Palette.ok)
                        )
                    }

                    s.items.forEach { item ->
                        HorizontalDivider(color = Palette.line, modifier = Modifier.padding(top = 11.dp))
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(item.displayName, color = Palette.text, fontSize = 16.sp)
                                if (!item.mcName.isNullOrBlank() && !item.skuTitle.isNullOrBlank()) {
                                    Text(item.skuTitle, color = Palette.muted, fontSize = 12.sp)
                                }
                            }
                            Text(
                                "${item.scanned}/${item.needed}",
                                color = if (item.remaining == 0) Palette.ok else Palette.muted,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        GhostButton(
                            "Qayta chiqarish",
                            onClick = {
                                scope.launch {
                                    runCatching { api.jobs(s.id) }
                                        .onSuccess { reprintJobs = it.jobs }
                                        .onFailure { banner = Banner(Palette.err, "XATO", it.message.orEmpty()) }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )
                        if (!s.isClosed) {
                            GhostButton(
                                "Bekor qilish",
                                onClick = { confirmCancel = true },
                                modifier = Modifier.weight(1f),
                                borderColor = Palette.err,
                                textColor = Palette.err,
                            )
                        }
                    }
                }
            } else {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 44.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("Tovarni skanerlang", color = Palette.text, fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
                    Text("Buyurtma avtomatik topiladi", color = Palette.muted, fontSize = 15.sp)
                }
            }

            TextButton(onClick = { manualOpen = true }, modifier = Modifier.fillMaxWidth()) {
                Text("Barcode'ni qo'lda kiritish", color = Palette.muted, fontSize = 15.sp)
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    /* ---------- Dialoglar ---------- */

    if (manualOpen) {
        AlertDialog(
            onDismissRequest = { manualOpen = false },
            containerColor = Palette.panel,
            title = { Text("Barcode", color = Palette.text) },
            text = {
                Field(
                    label = "",
                    value = manualValue,
                    onValueChange = { manualValue = it },
                    placeholder = "1000076067784",
                    keyboardType = KeyboardType.Number,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val v = manualValue
                    manualValue = ""
                    manualOpen = false
                    submit(v)
                }) { Text("Yuborish", color = Palette.accent) }
            },
            dismissButton = {
                TextButton(onClick = { manualOpen = false }) { Text("Yopish", color = Palette.muted) }
            },
        )
    }

    if (confirmCancel) {
        val s = session
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            containerColor = Palette.panel,
            title = { Text("Sessiyani bekor qilish", color = Palette.text) },
            text = { Text("${s?.orderId} yig'ishni to'xtatasizmi?", color = Palette.muted) },
            confirmButton = {
                TextButton(onClick = {
                    confirmCancel = false
                    scope.launch {
                        runCatching { api.cancelSession("operator bekor qildi") }
                            .onSuccess { session = null; banner = null }
                            .onFailure { banner = Banner(Palette.err, "XATO", it.message.orEmpty()) }
                    }
                }) { Text("Ha, bekor qilish", color = Palette.err) }
            },
            dismissButton = {
                TextButton(onClick = { confirmCancel = false }) { Text("Yo'q", color = Palette.muted) }
            },
        )
    }

    reprintJobs?.let { jobs ->
        AlertDialog(
            onDismissRequest = { reprintJobs = null },
            containerColor = Palette.panel,
            title = { Text("Qaysi yorliq qayta chiqsin?", color = Palette.text) },
            text = {
                Column {
                    if (jobs.isEmpty()) {
                        Text("Bu sessiyada yorliq yo'q", color = Palette.muted, fontSize = 15.sp)
                    }
                    jobs.forEach { job ->
                        TextButton(
                            onClick = {
                                reprintJobs = null
                                scope.launch {
                                    runCatching { api.reprint(job.id) }
                                        .onSuccess {
                                            feedback.buzz(Buzz.OK)
                                            banner = Banner(Palette.accent, "YUBORILDI", "Yorliq qayta chop etishga ketdi")
                                            bannerAt = System.currentTimeMillis()
                                        }
                                        .onFailure { banner = Banner(Palette.err, "XATO", it.message.orEmpty()) }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                "${if (job.target == "big") "BIG" else "ShK"}" +
                                    (if (job.copies > 1) " ×${job.copies}" else "") +
                                    " · ${job.orderId} · ${job.status}",
                                color = Palette.text,
                                fontSize = 15.sp,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { reprintJobs = null }) { Text("Yopish", color = Palette.muted) }
            },
        )
    }
}
