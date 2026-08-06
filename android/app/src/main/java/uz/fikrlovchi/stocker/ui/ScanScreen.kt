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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uz.fikrlovchi.stocker.BuildConfig
import uz.fikrlovchi.stocker.data.Api
import uz.fikrlovchi.stocker.data.ApiException
import uz.fikrlovchi.stocker.data.Config
import uz.fikrlovchi.stocker.data.PrintJob
import uz.fikrlovchi.stocker.data.ScanResult
import uz.fikrlovchi.stocker.data.Session
import uz.fikrlovchi.stocker.data.Shop
import uz.fikrlovchi.stocker.scan.ScanMode
import uz.fikrlovchi.stocker.scan.ScannerView
import uz.fikrlovchi.stocker.util.Buzz
import uz.fikrlovchi.stocker.util.Feedback

private const val SAME_CODE_COOLDOWN_MS = 1200L
private const val BANNER_MS = 3500L

private data class Banner(val color: Color, val title: String, val message: String)

/**
 * Asosiy ekran. Yuqorida — do'kon tanlash va uning progressi (2/22), o'rtada
 * kamera, pastda buyurtma tarkibi va **PRINT** tugmasi.
 *
 * Barcode'ni qo'lda kiritish OLIB TASHLANDI: skaner ishlamasa muammo
 * kamerada yoki yorug'likda, qo'lda terish esa xato kod kiritish yo'li edi.
 */
@Composable
fun ScanScreen(
    config: Config,
    api: Api,
    feedback: Feedback,
    onScanModeChange: (ScanMode) -> Unit,
    onShopChange: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenHistory: () -> Unit,
    onAuthExpired: () -> Unit,
) {
    val p = LocalPalette.current
    val s = LocalStrings.current

    var session by remember { mutableStateOf<Session?>(null) }
    var banner by remember { mutableStateOf<Banner?>(null) }
    var busy by remember { mutableStateOf(false) }
    var printing by remember { mutableStateOf(false) }
    var offline by remember { mutableStateOf(false) }

    var shops by remember { mutableStateOf<List<Shop>>(emptyList()) }
    var batchName by remember { mutableStateOf<String?>(null) }
    var shopPicker by remember { mutableStateOf(false) }

    val mode = ScanMode.from(config.scanMode)
    var torchOn by remember { mutableStateOf(false) }
    var torchAvailable by remember { mutableStateOf(false) }

    var confirmCancel by remember { mutableStateOf(false) }
    var reprintJobs by remember { mutableStateOf<List<PrintJob>?>(null) }

    var lastCode by remember { mutableStateOf("") }
    var lastCodeAt by remember { mutableLongStateOf(0L) }
    var bannerAt by remember { mutableLongStateOf(0L) }

    val scope = rememberCoroutineScope()

    fun showBanner(result: String, message: String?) {
        val style = resultStyle(result, p, s)
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

    fun fail(e: Throwable) {
        val apiErr = e as? ApiException
        offline = apiErr?.offline == true
        if (apiErr?.authExpired == true) onAuthExpired()
        banner = Banner(p.err, if (apiErr?.offline == true) "…" else "XATO", e.message.orEmpty())
        bannerAt = System.currentTimeMillis()
    }

    // Banner o'zi yo'qoladi.
    LaunchedEffect(bannerAt) {
        if (bannerAt == 0L) return@LaunchedEffect
        kotlinx.coroutines.delay(BANNER_MS)
        if (System.currentTimeMillis() - bannerAt >= BANNER_MS) banner = null
    }

    suspend fun loadShops() {
        runCatching { api.shops() }
            .onSuccess {
                shops = it.shops
                batchName = it.batch?.name
                offline = false
            }
            .onFailure { e -> if (e is ApiException && e.authExpired) onAuthExpired() }
    }

    // Sessiya SERVERDA saqlanadi — ilova yopilib ochilsa ham yig'ish joyidan
    // davom etadi.
    LaunchedEffect(config.operator) {
        runCatching { api.session() }
            .onSuccess { session = it; offline = false }
            .onFailure { e ->
                if (e is ApiException && e.status == 404) session = null
                else if (e is ApiException && e.authExpired) onAuthExpired()
                else if (e is ApiException) offline = e.offline
            }
        loadShops()
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
                    // Buyurtma yig'ilgach do'kon hisobi o'zgaradi.
                    if (r.result == ScanResult.ORDER_COMPLETE) loadShops()
                }
                .onFailure { feedback.buzz(Buzz.ERROR); fail(it) }
            busy = false
        }
    }

    val current = session
    val selectedShop = shops.firstOrNull { it.shopId == config.shopId }
    val readyToPrint = current != null && current.progress.remaining == 0

    Column(Modifier.fillMaxSize().background(p.bg)) {

        /* ---------- Sarlavha: do'kon · progress · tugmalar ---------- */
        Row(
            Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 48.dp, bottom = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Chapda — do'kon tanlash (yig'ilmagan buyurtmalar soni bilan).
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { shopPicker = true }
                    .padding(horizontal = 6.dp, vertical = 4.dp)
            ) {
                Text(
                    selectedShop?.title ?: (if (shops.isEmpty()) s.noBatch else s.chooseShop),
                    color = p.text,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    (if (config.stationId.isNotBlank()) "📍 ${config.stationId}" else "⚠ ${s.noStation}") +
                        "  ·  v${BuildConfig.VERSION_NAME}",
                    color = if (config.stationId.isNotBlank()) p.muted else p.warn,
                    fontSize = 12.sp,
                )
            }

            // O'rtada — tanlangan do'kon bo'yicha "2/22".
            selectedShop?.let { shop ->
                Text(
                    "${shop.packed}/${shop.total}",
                    color = if (shop.pending == 0) p.done else p.accent,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 10.dp),
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GhostButton("🕘", onOpenHistory, Modifier.size(width = 52.dp, height = 44.dp))
                GhostButton("⚙", onOpenSettings, Modifier.size(width = 52.dp, height = 44.dp))
            }
        }

        if (offline) {
            Text(
                s.offline,
                color = onColor(p.warn),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.fillMaxWidth().background(p.warn).padding(vertical = 7.dp),
                textAlign = TextAlign.Center,
            )
        }

        /* ---------- Kamera ---------- */
        Box(Modifier.fillMaxWidth().height(240.dp).clipToBounds().background(Color.Black)) {
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

            Box(
                Modifier
                    .align(Alignment.Center)
                    .then(
                        if (mode == ScanMode.QR) Modifier.size(150.dp)
                        else Modifier.size(width = 220.dp, height = 120.dp)
                    )
                    .border(3.dp, Color(0xBFFFFFFF), RoundedCornerShape(14.dp))
            )

            if (torchAvailable) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(10.dp)
                        .size(44.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(if (torchOn) p.accent else Color(0x8C000000))
                        .clickable { torchOn = !torchOn },
                    contentAlignment = Alignment.Center,
                ) { Text("🔦", fontSize = 20.sp) }
            }

            Row(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 10.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x99000000))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                listOf(ScanMode.BARCODE to s.modeBarcode, ScanMode.QR to s.modeQr, ScanMode.MIXED to s.modeMixed)
                    .forEach { (m, label) ->
                        val active = m == mode
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (active) p.accent else Color.Transparent)
                                .clickable { if (!active) onScanModeChange(m) }
                                .padding(horizontal = 14.dp, vertical = 7.dp),
                        ) {
                            Text(
                                label,
                                color = if (active) onColor(p.accent) else Color.White,
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
            val fg = onColor(b.color)
            Column(Modifier.fillMaxWidth().background(b.color).padding(horizontal = 18.dp, vertical = 14.dp)) {
                Text(b.title, color = fg, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                if (b.message.isNotBlank()) Text(b.message, color = fg.copy(alpha = 0.92f), fontSize = 15.sp)
            }
        }

        /* ---------- Buyurtma ---------- */
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            if (current != null) {
                Column(
                    Modifier
                        .padding(14.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(p.panel)
                        .border(1.dp, p.line, RoundedCornerShape(14.dp))
                        .padding(16.dp)
                ) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Text(current.orderId, color = p.text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "${current.progress.scanned} / ${current.progress.total}",
                            color = if (current.isClosed) p.done else p.text,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(p.line)) {
                        Box(
                            Modifier
                                .fillMaxWidth(current.percent / 100f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (current.isClosed) p.done else p.ok)
                        )
                    }

                    current.items.forEach { item ->
                        HorizontalDivider(color = p.line, modifier = Modifier.padding(top = 11.dp))
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(item.displayName, color = p.text, fontSize = 16.sp)
                                if (!item.mcName.isNullOrBlank() && !item.skuTitle.isNullOrBlank()) {
                                    Text(item.skuTitle, color = p.muted, fontSize = 12.sp)
                                }
                            }
                            Text(
                                "${item.scanned}/${item.needed}",
                                color = if (item.remaining == 0) p.ok else p.muted,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        GhostButton(
                            s.reprint,
                            onClick = {
                                scope.launch {
                                    runCatching { api.jobs(current.id) }
                                        .onSuccess { reprintJobs = it.jobs }
                                        .onFailure { fail(it) }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )
                        if (!current.isClosed) {
                            GhostButton(
                                s.cancelSession,
                                onClick = { confirmCancel = true },
                                modifier = Modifier.weight(1f),
                                borderColor = p.err,
                                textColor = p.err,
                            )
                        }
                    }
                }
            } else {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(s.chooseShop, color = p.muted, fontSize = 15.sp)
                    batchName?.let { Text(it, color = p.text, fontSize = 19.sp, fontWeight = FontWeight.SemiBold) }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        /* ---------- PRINT ---------- */
        // Faqat buyurtmadagi hamma tovar skanerlangach faollashadi: yorliq
        // yarim yig'ilgan qopga chiqib ketmasin.
        Column(Modifier.padding(horizontal = 14.dp).padding(bottom = 20.dp)) {
            PrimaryButton(
                text = s.print,
                modifier = Modifier.fillMaxWidth(),
                enabled = readyToPrint,
                loading = printing,
                height = 58,
                onClick = {
                    val id = current?.id ?: return@PrimaryButton
                    printing = true
                    scope.launch {
                        runCatching { api.printBig(id) }
                            .onSuccess {
                                feedback.buzz(Buzz.DONE)
                                banner = Banner(p.done, s.print, s.printSent)
                                bannerAt = System.currentTimeMillis()
                            }
                            .onFailure { fail(it) }
                        printing = false
                    }
                },
            )
            if (!readyToPrint) {
                Text(
                    s.printNotComplete,
                    color = p.muted,
                    fontSize = 12.sp,
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }

    /* ---------- Dialoglar ---------- */

    if (shopPicker) {
        AlertDialog(
            onDismissRequest = { shopPicker = false },
            containerColor = p.panel,
            title = { Text(batchName ?: s.noBatch, color = p.text) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    if (shops.isEmpty()) Text(s.noBatch, color = p.muted, fontSize = 15.sp)
                    shops.forEach { shop ->
                        TextButton(
                            onClick = {
                                onShopChange(shop.shopId)
                                shopPicker = false
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(shop.title, color = p.text, fontSize = 16.sp)
                                Text(
                                    "${shop.packed}/${shop.total}",
                                    color = if (shop.pending == 0) p.done else p.accent,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { shopPicker = false }) { Text(s.back, color = p.muted) }
            },
        )
    }

    if (confirmCancel) {
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            containerColor = p.panel,
            title = { Text(s.cancelSession, color = p.text) },
            text = { Text("${current?.orderId} — ${s.cancelConfirm}", color = p.muted) },
            confirmButton = {
                TextButton(onClick = {
                    confirmCancel = false
                    scope.launch {
                        runCatching { api.cancelSession("operator bekor qildi") }
                            .onSuccess { session = null; banner = null }
                            .onFailure { fail(it) }
                    }
                }) { Text(s.cancelSession, color = p.err) }
            },
            dismissButton = {
                TextButton(onClick = { confirmCancel = false }) { Text(s.back, color = p.muted) }
            },
        )
    }

    reprintJobs?.let { jobs ->
        AlertDialog(
            onDismissRequest = { reprintJobs = null },
            containerColor = p.panel,
            title = { Text(s.reprint, color = p.text) },
            text = {
                Column {
                    if (jobs.isEmpty()) Text("—", color = p.muted, fontSize = 15.sp)
                    jobs.forEach { job ->
                        TextButton(
                            onClick = {
                                reprintJobs = null
                                scope.launch {
                                    runCatching { api.reprint(job.id) }
                                        .onSuccess {
                                            feedback.buzz(Buzz.OK)
                                            banner = Banner(p.accent, s.reprint, s.printSent)
                                            bannerAt = System.currentTimeMillis()
                                        }
                                        .onFailure { fail(it) }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                (if (job.target == "big") "BIG" else "ShK") +
                                    (if (job.copies > 1) " ×${job.copies}" else "") +
                                    " · ${job.orderId} · ${job.status}",
                                color = p.text,
                                fontSize = 15.sp,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { reprintJobs = null }) { Text(s.back, color = p.muted) }
            },
        )
    }
}
