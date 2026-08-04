package uz.fikrlovchi.stocker.scan

import android.annotation.SuppressLint
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
// lifecycle-runtime-compose'dagi variant — compose.ui.platform'dagisi eskirgan.
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/**
 * CameraX oqimi + ML Kit barcode o'quvchi.
 *
 * ML Kit'ning "bundled" varianti modelni APK ichida olib yuradi — Google Play
 * Services ham, internet ham kerak emas. Ombor sharoitida bu muhim.
 *
 * Faqat kerakli formatlar yoqilgan: cheklangan ro'yxat tanib olishni
 * tezlashtiradi va noto'g'ri o'qishni kamaytiradi.
 */
private val SCANNER_OPTIONS = BarcodeScannerOptions.Builder()
    .setBarcodeFormats(
        Barcode.FORMAT_EAN_13,
        Barcode.FORMAT_EAN_8,
        Barcode.FORMAT_UPC_A,
        Barcode.FORMAT_UPC_E,
        Barcode.FORMAT_CODE_128,
        Barcode.FORMAT_CODE_39,
        Barcode.FORMAT_CODE_93,
        Barcode.FORMAT_ITF,
        Barcode.FORMAT_CODABAR,
    )
    .build()

/** QR uchun alohida sozlama — ish joyini juftlashda ishlatiladi. */
private val QR_OPTIONS = BarcodeScannerOptions.Builder()
    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
    .build()

@Composable
fun ScannerView(
    modifier: Modifier = Modifier,
    qrOnly: Boolean = false,
    /** true bo'lsa kadrlar tashlab yuboriladi (so'rov ketayotganda). */
    paused: Boolean = false,
    onBarcode: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Callback va `paused` o'zgarganda kamera qayta ishga tushmasligi kerak —
    // shuning uchun ular rememberUpdatedState orqali o'qiladi.
    val currentOnBarcode = rememberUpdatedState(onBarcode)
    val currentPaused = rememberUpdatedState(paused)

    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val scanner: BarcodeScanner = remember(qrOnly) {
        BarcodeScanning.getClient(if (qrOnly) QR_OPTIONS else SCANNER_OPTIONS)
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }

            val providerFuture = ProcessCameraProvider.getInstance(ctx)
            providerFuture.addListener({
                val provider = providerFuture.get()

                // setSurfaceProvider() — Kotlin property sintaksisi emas:
                // Preview'da getter yo'q, faqat setter bor.
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                // 1280×720 yetarli: kichik barcode'ni ham o'qiydi, lekin
                // to'liq matritsadan ancha tez ishlanadi.
                val resolution = ResolutionSelector.Builder()
                    .setResolutionStrategy(
                        ResolutionStrategy(
                            android.util.Size(1280, 720),
                            ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                        )
                    )
                    .build()

                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(resolution)
                    // Eng yangi kadr bilan ishlaymiz: navbat yig'ilib kechikish
                    // paydo bo'lmasin.
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                    if (currentPaused.value) {
                        imageProxy.close()
                    } else {
                        process(scanner, imageProxy) { value ->
                            ContextCompat.getMainExecutor(ctx).execute {
                                currentOnBarcode.value(value)
                            }
                        }
                    }
                }

                runCatching {
                    provider.unbindAll()
                    provider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis,
                    )
                }
            }, ContextCompat.getMainExecutor(ctx))

            previewView
        },
    )
}

@SuppressLint("UnsafeOptInUsageError")
private fun process(scanner: BarcodeScanner, imageProxy: ImageProxy, onValue: (String) -> Unit) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
        .addOnSuccessListener { barcodes ->
            barcodes.firstNotNullOfOrNull { barcode ->
                barcode.rawValue?.takeIf { it.isNotBlank() }
            }?.let(onValue)
        }
        .addOnCompleteListener { imageProxy.close() }
}
