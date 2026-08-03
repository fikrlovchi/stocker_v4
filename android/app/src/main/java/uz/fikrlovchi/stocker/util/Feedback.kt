package uz.fikrlovchi.stocker.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Tebranish bilan qaytarma aloqa.
 *
 * Omborda operator ekranga qaramasdan ham natijani bilishi kerak, shuning
 * uchun har natija turi o'z naqshiga ega. Naqshlar ataylab bir-biridan
 * keskin farq qiladi: qabul qilindi — bitta qisqa, xato — uchta kuchli,
 * buyurtma yig'ildi — uzun ketma-ketlik.
 */
enum class Buzz { OK, WARN, ERROR, DONE }

class Feedback(context: Context) {

    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    fun buzz(kind: Buzz) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return

        // timings: kutish, tebranish, kutish, tebranish...  (0 dan boshlanadi)
        val (timings, amplitudes) = when (kind) {
            Buzz.OK -> longArrayOf(0, 60) to intArrayOf(0, 160)
            Buzz.WARN -> longArrayOf(0, 120, 90, 120) to intArrayOf(0, 200, 0, 200)
            Buzz.ERROR -> longArrayOf(0, 160, 110, 160, 110, 160) to
                intArrayOf(0, 255, 0, 255, 0, 255)
            Buzz.DONE -> longArrayOf(0, 90, 70, 90, 70, 260) to
                intArrayOf(0, 180, 0, 180, 0, 255)
        }

        runCatching {
            if (v.hasAmplitudeControl()) {
                v.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
            } else {
                v.vibrate(VibrationEffect.createWaveform(timings, -1))
            }
        }
    }
}
