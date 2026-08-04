package uz.fikrlovchi.stocker.scan

import android.annotation.SuppressLint
import android.util.Size
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
// lifecycle-runtime-compose'dagi variant — compose.ui.platform'dagisi eskirgan.
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/**
 * CameraX oqimi + ML Kit barcode o'quvchi.
 *
 * ML Kit'ning "bundled" varianti modelni APK ichida olib yuradi — Google Play
 * Services ham, internet ham kerak emas. Ombor sharoitida bu muhim.
 *
 * @param mode qaysi formatlar qidiriladi (ScanMode)
 * @param torchOn telefon chirog'i
 * @param paused true bo'lsa kadrlar tashlab yuboriladi (so'rov ketayotganda)
 * @param onTorchAvailable qurilmada chiroq bor-yo'qligi (tugmani yashirish uchun)
 */
@Composable
fun ScannerView(
    modifier: Modifier = Modifier,
    mode: ScanMode = ScanMode.MIXED,
    torchOn: Boolean = false,
    paused: Boolean = false,
    onTorchAvailable: (Boolean) -> Unit = {},
    onBarcode: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Callback va holat o'zgarganda kamera QAYTA ISHGA TUSHMASLIGI kerak —
    // shuning uchun ular rememberUpdatedState orqali o'qiladi.
    val currentOnBarcode = rememberUpdatedState(onBarcode)
    val currentPaused = rememberUpdatedState(paused)

    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    DisposableEffect(Unit) { onDispose { analysisExecutor.shutdown() } }

    // Rejim o'zgarganda yangi scanner yasaladi, kamera esa qayta bog'lanmaydi:
    // analizator har kadrda ENG YANGI scanner'ni o'qiydi.
    val scanner: BarcodeScanner = remember(mode) { BarcodeScanning.getClient(scannerOptions(mode)) }
    val currentScanner = rememberUpdatedState(scanner)
    DisposableEffect(scanner) { onDispose { runCatching { scanner.close() } } }

    var camera by remember { mutableStateOf<Camera?>(null) }

    // Chiroq holati va qurilmada chiroq bor-yo'qligi.
    LaunchedEffect(camera, torchOn) {
        val cam = camera ?: return@LaunchedEffect
        onTorchAvailable(cam.cameraInfo.hasFlashUnit())
        if (cam.cameraInfo.hasFlashUnit()) {
            runCatching { cam.cameraControl.enableTorch(torchOn) }
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx).apply {
                // MUHIM: standart PERFORMANCE rejimi SurfaceView ishlatadi, u
                // esa oynada "teshik" ochib alohida qatlamda chiziladi va
                // Compose'ning kesishini ham, qatlam tartibini ham HISOBGA
                // OLMAYDI. Natijada kamera o'z qutisidan chiqib ketadi va
                // ustidagi tugmalar orqasida ko'rinmay qoladi.
                // COMPATIBLE — TextureView, oddiy view ierarxiyasida chiziladi.
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }

            val providerFuture = ProcessCameraProvider.getInstance(ctx)
            providerFuture.addListener({
                val provider = providerFuture.get()

                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                // 1280×720 yetarli: kichik barcode'ni ham o'qiydi, lekin
                // to'liq matritsadan ancha tez ishlanadi.
                val resolution = ResolutionSelector.Builder()
                    .setResolutionStrategy(
                        ResolutionStrategy(
                            Size(1280, 720),
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
                        process(currentScanner.value, imageProxy) { value ->
                            ContextCompat.getMainExecutor(ctx).execute {
                                currentOnBarcode.value(value)
                            }
                        }
                    }
                }

                runCatching {
                    provider.unbindAll()
                    camera = provider.bindToLifecycle(
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
    // Scanner rejim o'zgarishida yopilishi mumkin — bunda process() otadi.
    runCatching {
        scanner.process(image)
            .addOnSuccessListener { barcodes ->
                barcodes.firstNotNullOfOrNull { barcode ->
                    barcode.rawValue?.takeIf { it.isNotBlank() }
                }?.let(onValue)
            }
            .addOnCompleteListener { imageProxy.close() }
    }.onFailure { imageProxy.close() }
}
