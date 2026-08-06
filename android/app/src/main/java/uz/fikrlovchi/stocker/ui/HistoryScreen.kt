package uz.fikrlovchi.stocker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.fikrlovchi.stocker.data.Api
import uz.fikrlovchi.stocker.data.PackedOrder

/**
 * "Men yig'ganlarim": qaysi kuni qaysi buyurtmani yig'gan va tarkibi nima
 * bo'lgan. Ma'lumot serverdan keladi — telefon almashsa ham tarix qoladi.
 */
@Composable
fun HistoryScreen(api: Api, onBack: () -> Unit) {
    val p = LocalPalette.current
    val s = LocalStrings.current

    var orders by remember { mutableStateOf<List<PackedOrder>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { api.myPacked() }
            .onSuccess { orders = it.orders }
            .onFailure { error = it.message }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(top = 48.dp, bottom = 24.dp)
    ) {
        Text(s.history, color = p.text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(14.dp))

        when {
            error != null -> Text(error!!, color = p.err, fontSize = 15.sp)
            orders == null -> Row(
                Modifier.fillMaxWidth().padding(vertical = 30.dp),
                horizontalArrangement = Arrangement.Center,
            ) { CircularProgressIndicator(color = p.accent) }
            orders!!.isEmpty() -> Text(s.historyEmpty, color = p.muted, fontSize = 15.sp)
            else -> orders!!.forEach { order -> HistoryCard(order, p, s) }
        }

        Spacer(Modifier.height(20.dp))
        PrimaryButton(s.back, onBack, Modifier.fillMaxWidth())
    }
}

@Composable
private fun HistoryCard(order: PackedOrder, p: Palette, s: Strings) {
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
            // Server ISO vaqt beradi: "2026-08-06T09:12:33.123Z" → sana + soat.
            (order.finishedAt ?: "").replace("T", " ").take(16) +
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
    }
}
