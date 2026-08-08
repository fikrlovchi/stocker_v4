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
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uz.fikrlovchi.stocker.data.Api
import uz.fikrlovchi.stocker.data.PackedOrder

/**
 * "Men yig'ganlarim": qaysi kuni qaysi buyurtmani yig'gan va tarkibi nima
 * bo'lgan. Ma'lumot serverdan keladi — telefon almashsa ham tarix qoladi.
 *
 * Ro'yxat KUNLAR bo'yicha guruhlanadi va standart holatda yopiq turadi:
 * bir kunda yuzlab buyurtma bo'lishi mumkin, hammasi ochiq bo'lsa kerakli
 * kunni topib bo'lmaydi.
 */
@Composable
fun HistoryScreen(api: Api, onBack: () -> Unit) {
    val p = LocalPalette.current
    val s = LocalStrings.current
    val scope = rememberCoroutineScope()

    var orders by remember { mutableStateOf<List<PackedOrder>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    // Qaysi kunlar ochiq. Birinchi (eng yangi) kun o'zi ochiladi.
    var openDays by remember { mutableStateOf<Set<String>>(emptySet()) }
    // Qayta chiqarish oynasi shu buyurtma uchun ochilgan.
    var reprintFor by remember { mutableStateOf<PackedOrder?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        runCatching { api.myPacked() }
            .onSuccess {
                orders = it.orders
                it.orders.firstOrNull()?.let { first -> openDays = setOf(dayOf(first)) }
            }
            .onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize()) {
        // Orqaga — yuqori chap burchakda. Ilgari sahifa oxirida edi va
        // uzun ro'yxatda unga yetib borish uchun pastgacha aylantirish
        // kerak bo'lardi.
        Row(
            Modifier.fillMaxWidth().padding(start = 8.dp, end = 16.dp, top = 36.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Text("←", color = p.text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(4.dp))
            Text(s.history, color = p.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        }

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp)
        ) {
            note?.let { Text(it, color = p.done, fontSize = 14.sp, modifier = Modifier.padding(bottom = 8.dp)) }

            when {
                error != null -> Text(error!!, color = p.err, fontSize = 15.sp)
                orders == null -> Row(
                    Modifier.fillMaxWidth().padding(vertical = 30.dp),
                    horizontalArrangement = Arrangement.Center,
                ) { CircularProgressIndicator(color = p.accent) }
                orders!!.isEmpty() -> Text(s.historyEmpty, color = p.muted, fontSize = 15.sp)
                else -> {
                    // Server yangi-dan eskiga tartiblab beradi, shuning uchun
                    // guruhlar ham shu tartibda chiqadi.
                    val byDay = orders!!.groupBy { dayOf(it) }
                    byDay.forEach { (day, list) ->
                        DayGroup(
                            day = day,
                            count = list.size,
                            open = day in openDays,
                            onToggle = {
                                openDays = if (day in openDays) openDays - day else openDays + day
                            },
                            p = p,
                        )
                        if (day in openDays) {
                            list.forEach { order ->
                                HistoryCard(order, p, s, onReprint = { reprintFor = order })
                            }
                        }
                    }
                }
            }
        }
    }

    // Qayta chiqarish: ShK, BIG yoki ikkalasi.
    reprintFor?.let { order ->
        val send: (String) -> Unit = { target ->
            val id = order.sessionId
            reprintFor = null
            if (id != null) {
                busy = true
                scope.launch {
                    runCatching { api.reprintSession(id, target) }
                        .onSuccess { note = "${order.orderId}: ${it.printed} ${s.printShkSent}" }
                        .onFailure { error = it.message }
                    busy = false
                }
            } else {
                error = s.reprintNoSession
            }
        }

        AlertDialog(
            onDismissRequest = { reprintFor = null },
            containerColor = p.panel,
            title = { Text("${s.reprint} · ${order.orderId}", color = p.text, fontSize = 18.sp) },
            text = {
                Column {
                    Text(s.reprintChoose, color = p.muted, fontSize = 14.sp)
                    Spacer(Modifier.height(12.dp))
                    GhostButton(s.reprintShk, { send("shk") }, Modifier.fillMaxWidth(), enabled = !busy)
                    Spacer(Modifier.height(8.dp))
                    GhostButton(s.reprintBig, { send("big") }, Modifier.fillMaxWidth(), enabled = !busy)
                    Spacer(Modifier.height(8.dp))
                    PrimaryButton(s.reprintBoth, { send("both") }, Modifier.fillMaxWidth(), enabled = !busy)
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { reprintFor = null }) { Text(s.back, color = p.muted) }
            },
        )
    }
}

/**
 * Sana kaliti. Server ISO beradi ("2026-08-08T09:12:33.123Z") — undan
 * `8/8/2026` ko'rinishi yasaladi (namunadagi kabi).
 */
private fun dayOf(order: PackedOrder): String {
    val iso = order.finishedAt ?: order.startedAt ?: return "—"
    val date = iso.take(10)                       // 2026-08-08
    val parts = date.split("-")
    if (parts.size != 3) return date
    val day = parts[2].trimStart('0').ifEmpty { "0" }
    val month = parts[1].trimStart('0').ifEmpty { "0" }
    return "$day/$month/${parts[0]}"
}

@Composable
private fun DayGroup(day: String, count: Int, open: Boolean, onToggle: () -> Unit, p: Palette) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 10.dp, bottom = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onToggle)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (open) "▾" else "▸", color = p.muted, fontSize = 15.sp)
        Spacer(Modifier.width(10.dp))
        Text(day, color = p.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(10.dp))
        Box(
            Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(p.line)
                .padding(horizontal = 8.dp, vertical = 2.dp)
        ) {
            Text("$count", color = p.text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun HistoryCard(order: PackedOrder, p: Palette, s: Strings, onReprint: () -> Unit) {
    Column(
        Modifier
            .padding(bottom = 12.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(p.panel)
            .border(1.dp, p.line, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(order.orderId, color = p.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Text("${order.items.size} ${s.historyItems}", color = p.muted, fontSize = 13.sp)
        }
        Text(
            // Kun sarlavhada ko'rinadi, bu yerda faqat soat kerak.
            (order.finishedAt ?: "").drop(11).take(5) +
                (order.batch?.let { "  ·  $it" } ?: "") +
                (order.stationId?.let { "  ·  $it" } ?: ""),
            color = p.muted,
            fontSize = 12.sp,
        )

        order.items.forEach { item ->
            HorizontalDivider(color = p.line, modifier = Modifier.padding(top = 9.dp))
            Row(
                Modifier.fillMaxWidth().padding(top = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(item.title, color = p.text, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Text("${item.scanned}/${item.needed}", color = p.ok, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(12.dp))
        GhostButton(s.reprint, onReprint, Modifier.fillMaxWidth())
    }
}
