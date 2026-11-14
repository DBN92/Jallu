package br.dia.app

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Voz da Luna (Dii): o servidor gera o áudio com o Piper e o tablet só toca. Se não der (voz não
 * instalada no servidor, sem conexão), chama onFail e quem pediu usa a voz do Android.
 */
object LunaVoice {
    private val main = Handler(Looper.getMainLooper())
    private var current: MediaPlayer? = null

    fun play(ctx: Context, prefs: Prefs, text: String, onDone: () -> Unit, onFail: () -> Unit) {
        val clean = text.replace(Regex("\\s+"), " ").trim().take(600)
        if (!prefs.lunaVoice || clean.isEmpty() || prefs.url.isBlank() || prefs.token.isBlank()) return onFail()
        stop()
        val once = AtomicBoolean(false)
        val mp = MediaPlayer()
        current = mp
        fun end(ok: Boolean) {
            if (!once.compareAndSet(false, true)) return
            try { mp.release() } catch (_: Exception) {}
            if (current === mp) current = null
            main.post { if (ok) onDone() else onFail() }
        }
        // Sem resposta do servidor em 12 s: fala com a voz do Android
        main.postDelayed({ if (!mp.isPlayingSafe()) end(false) }, 12_000)
        try {
            mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            mp.setDataSource(ctx, Uri.parse("${prefs.url}/api/tts?text=${Uri.encode(clean)}"), mapOf("Authorization" to "Bearer ${prefs.token}"))
            mp.setOnPreparedListener { it.start() }
            mp.setOnCompletionListener { end(true) }
            mp.setOnErrorListener { _, _, _ -> end(false); true }
            mp.prepareAsync()
        } catch (_: Exception) {
            end(false)
        }
    }

    private fun MediaPlayer.isPlayingSafe() = try { isPlaying } catch (_: Exception) { false }

    fun stop() {
        current?.let { try { it.stop() } catch (_: Exception) {}; try { it.release() } catch (_: Exception) {} }
        current = null
    }
}
