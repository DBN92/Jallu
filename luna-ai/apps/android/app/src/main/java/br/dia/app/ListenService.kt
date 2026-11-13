package br.dia.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.util.Locale
import kotlin.concurrent.thread
import kotlin.math.max

/**
 * Escuta o chamado “Oi, Luna” o tempo todo (também com a tela desligada), no próprio tablet:
 *  1. Vosk off-line, restrito ao chamado “oi luna” (e iscas parecidas) — nenhum áudio sai do aparelho;
 *  2. ao ouvir, toca um sinal e reconhece o pedido (reconhecimento de fala do Android);
 *  3. manda o texto para a Luna (mesmo caminho seguro da Siri) e fala a resposta.
 * O Android exige um aviso fixo enquanto o microfone está em uso — com botão de pausar.
 */
class ListenService : Service() {
    companion object {
        const val ACTION_START = "br.dia.app.START"
        const val ACTION_PAUSE = "br.dia.app.PAUSE"
        const val ACTION_RESUME = "br.dia.app.RESUME"
        const val ACTION_LISTEN_NOW = "br.dia.app.LISTEN_NOW"
        const val ACTION_STOP = "br.dia.app.STOP"
        private const val CHANNEL = "escuta"
        private const val NOTIF_ID = 7

        @Volatile var status: String = "parado"
            private set

        fun send(ctx: Context, action: String) {
            val i = Intent(ctx, ListenService::class.java).setAction(action)
            try {
                if (action == ACTION_STOP) ctx.startService(i) else ctx.startForegroundService(i)
            } catch (_: Exception) {
                // Android 12+ não deixa iniciar o microfone em segundo plano: abre o app para iniciar
            }
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var prefs: Prefs
    private var model: Model? = null
    @Volatile private var listening = false
    @Volatile private var paused = false
    @Volatile private var inSession = false
    private var audioThread: Thread? = null
    private var lastWake = 0L
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speech: SpeechRecognizer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var pendingManual = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        // Rede de segurança: erro numa rotina de fundo (escuta, voz, download) não fecha o app —
        // só para a escuta e mostra o motivo no aviso. Erros na tela principal seguem o normal.
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            if (t === Looper.getMainLooper().thread) previous?.uncaughtException(t, e)
            else {
                listening = false
                status = "erro: ${e.message ?: e.javaClass.simpleName}"
                main.post { update("A escuta parou por um erro. Abra a Luna para tentar de novo.") }
            }
        }
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Escuta do chamado “Oi, Luna”", NotificationManager.IMPORTANCE_LOW))
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, notification("Preparando…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(NOTIF_ID, notification("Preparando…"))
        } catch (_: Exception) {
            stopSelf()
            return
        }
        // Tablet na tomada: mantém o processador acordado para ouvir com a tela desligada
        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dia:escuta").apply { acquire() }
        tts = TextToSpeech(this) { st ->
            if (st == TextToSpeech.SUCCESS) {
                tts?.language = Locale("pt", "BR")
                ttsReady = true
            }
        }
        loadModel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> { paused = true; speech?.cancel(); stopListening(); update() }
            ACTION_RESUME -> { paused = false; startListening() }
            ACTION_LISTEN_NOW -> if (model != null) main.post { beginCommand() } else pendingManual = true
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            else -> startListening()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        listening = false
        audioThread?.join(1500)
        speech?.destroy()
        tts?.shutdown()
        model?.close()
        wakeLock?.let { if (it.isHeld) it.release() }
        status = "parado"
        WebEvents.voice("idle")
        super.onDestroy()
    }

    // ---------------- Modelo e escuta do chamado “Oi, Luna” ----------------

    private fun loadModel() {
        thread(name = "dia-modelo") {
            // Mostra o progresso do download no aviso. Termina sozinha (sem interrupt): antes, a
            // interrupção durante o sleep derrubava o app inteiro logo depois de baixar o modelo.
            val loading = java.util.concurrent.atomic.AtomicBoolean(true)
            thread(name = "dia-progresso") {
                while (loading.get()) {
                    val p = ModelManager.progress
                    if (p >= 0) { status = "baixando $p%"; main.post { update("Baixando o modelo de voz… $p%") } }
                    try { Thread.sleep(700) } catch (_: InterruptedException) { break }
                }
            }
            try {
                val dir = ModelManager.ensure(this)
                model = Model(dir.absolutePath)
                main.post {
                    startListening()
                    if (pendingManual) { pendingManual = false; beginCommand() }
                }
            } catch (e: Throwable) {
                // Throwable: inclui falha ao carregar a biblioteca de voz no aparelho (não pode fechar o app)
                status = "erro: ${e.message ?: e.javaClass.simpleName}"
                main.post { update("Não consegui preparar a escuta: ${e.message ?: e.javaClass.simpleName}") }
            } finally {
                loading.set(false)
            }
        }
    }

    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun startListening() {
        val m = model ?: return
        if (paused || inSession || listening || !prefs.wake) { update(); return }
        if (!hasMic()) { status = "sem permissão de microfone"; update("Permita o microfone no app da Luna."); return }
        listening = true
        status = "ouvindo"
        update()
        val threshold = WakeMatch.threshold(prefs.sensitivity)
        audioThread = thread(name = "dia-escuta") {
            var triggered = false
            var tail: ShortArray? = null
            var record: AudioRecord? = null
            var rec: Recognizer? = null
            try {
                rec = Recognizer(m, 16000f, WakeMatch.GRAMMAR).apply { setWords(true) }
                val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                record = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(min, 6400))
                record.startRecording()
                val buf = ShortArray(1600) // 100 ms
                val gain = AutoGain()
                // Áudio da frase atual (até 15 s): se o pedido veio junto com o chamado, ele está aqui
                val utter = java.io.ByteArrayOutputStream()
                var fed = 0L
                var uttStart = 0L
                while (listening) {
                    val n = record.read(buf, 0, buf.size)
                    if (n <= 0) continue
                    gain.process(buf, n)
                    if (utter.size() < 16000 * 2 * 15) for (k in 0 until n) { utter.write(buf[k].toInt() and 0xff); utter.write((buf[k].toInt() shr 8) and 0xff) }
                    fed += n
                    if (rec.acceptWaveForm(buf, n)) {
                        val json = rec.result
                        val score = WakeMatch.score(json)
                        val now = System.currentTimeMillis()
                        if (score >= threshold && now - lastWake > 2500) {
                            lastWake = now
                            triggered = true
                            WakeMatch.tailStart(json)?.let { end ->
                                val bytes = utter.toByteArray()
                                val from = ((end * 16000).toLong() - uttStart).coerceIn(0, bytes.size / 2L).toInt()
                                tail = ShortArray(bytes.size / 2 - from) { i -> ((bytes[(from + i) * 2].toInt() and 0xff) or (bytes[(from + i) * 2 + 1].toInt() shl 8)).toShort() }
                            }
                            break
                        }
                        utter.reset()
                        uttStart = fed
                    }
                }
            } catch (e: Throwable) {
                status = "erro no microfone"
            } finally {
                try { record?.stop() } catch (_: Exception) {}
                record?.release()
                rec?.close()
                listening = false
            }
            val said = tail
            if (triggered && said != null && said.size > 16000 / 2) {
                // Pedido junto com o chamado: transcreve o que veio depois do “Luna” e já responde
                val text = transcribe(said)
                main.post { if (text.isNotBlank()) commandFromWake(text) else beginCommand() }
            } else if (triggered) main.post { beginCommand() }
            else if (!paused && !inSession && prefs.wake && status == "erro no microfone") main.postDelayed({ startListening() }, 3000)
        }
    }

    /** Transcreve um trecho de áudio já gravado com o Vosk (off-line, sem a lista restrita do chamado). */
    private fun transcribe(pcm: ShortArray): String {
        val m = model ?: return ""
        return try {
            Recognizer(m, 16000f).use { r ->
                var i = 0
                while (i < pcm.size) { val n = minOf(1600, pcm.size - i); r.acceptWaveForm(pcm.copyOfRange(i, i + n), n); i += n }
                WakeMatch.stripWake(JSONObject(r.finalResult).optString("text"))
            }
        } catch (_: Throwable) { "" }
    }

    /** O pedido veio na mesma frase do chamado: confirma com o bip e responde, sem pedir de novo. */
    private fun commandFromWake(text: String) {
        if (inSession) return
        inSession = true
        tts?.stop()
        try { ToneGenerator(AudioManager.STREAM_MUSIC, 70).startTone(ToneGenerator.TONE_PROP_ACK, 160) } catch (_: Exception) {}
        handleText(text)
    }

    private fun stopListening() {
        listening = false
        val t = audioThread
        if (t != null && t != Thread.currentThread()) t.join(1500)
        audioThread = null
    }

    // ---------------- Pedido, resposta e fala ----------------

    /** Quantas vezes já pediu para repetir nesta conversa (pede uma vez só) */
    private var retries = 0

    private fun beginCommand() {
        if (inSession) return
        inSession = true
        retries = 0
        stopListening()
        tts?.stop()
        status = "ouvindo o pedido"
        update("Pode falar…")
        try { ToneGenerator(AudioManager.STREAM_MUSIC, 70).startTone(ToneGenerator.TONE_PROP_ACK, 160) } catch (_: Exception) {}
        WebEvents.voice("listening")
        // Espera o sinal sonoro acabar para não “ouvir” o próprio bip
        main.postDelayed({ listenForCommand() }, 300)
    }

    private fun listenForCommand() {
        if (SpeechRecognizer.isRecognitionAvailable(this)) recognizeWithAndroid() else recognizeWithVosk()
    }

    /** Não ouviu nada: pergunta uma vez “Pode repetir?” e escuta de novo; na segunda, avisa e encerra. */
    private fun nothingHeard() {
        if (retries == 0) {
            retries++
            WebEvents.voice("listening")
            sayThen("Não ouvi. Pode repetir?") {
                try { ToneGenerator(AudioManager.STREAM_MUSIC, 70).startTone(ToneGenerator.TONE_PROP_ACK, 160) } catch (_: Exception) {}
                main.postDelayed({ listenForCommand() }, 300)
            }
        } else sayThen("Não consegui ouvir. É só me chamar de novo.") { endSession() }
    }

    /** Fala uma frase curta e depois segue (sem voz pronta, segue direto). */
    private fun sayThen(text: String, next: () -> Unit) {
        val t = tts
        if (t == null || !ttsReady) return next()
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { main.post(next) }
            @Deprecated("API antiga") override fun onError(id: String?) { main.post(next) }
        })
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "aviso-escuta")
    }

    private fun recognizeWithAndroid(busyRetry: Boolean = false) {
        speech?.destroy()
        val sr = SpeechRecognizer.createSpeechRecognizer(this)
        speech = sr
        var lastPartial = ""
        // O Android às vezes chama “erro” depois do resultado (ou duas vezes): só vale a primeira resposta
        var done = false
        sr.setRecognitionListener(object : RecognitionListener {
            override fun onPartialResults(b: Bundle?) {
                val t = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (t.isNotBlank()) { lastPartial = t; WebEvents.voice("listening", heard = t) }
            }
            override fun onResults(b: Bundle?) {
                if (done) return
                done = true
                val t = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().ifBlank { lastPartial }
                if (t.isBlank()) nothingHeard() else handleText(t)
            }
            override fun onError(error: Int) {
                if (done) return
                done = true
                when {
                    lastPartial.isNotBlank() -> handleText(lastPartial)
                    // Reconhecedor ainda preso na vez anterior: tenta de novo uma vez
                    !busyRetry && (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) ->
                        main.postDelayed({ recognizeWithAndroid(busyRetry = true) }, 500)
                    // Sem internet para o reconhecimento do Google: usa o off-line
                    error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || error == SpeechRecognizer.ERROR_SERVER -> recognizeWithVosk()
                    else -> nothingHeard()
                }
            }
            override fun onReadyForSpeech(p: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(v: Float) {}
            override fun onBufferReceived(b: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(t: Int, p: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            // Dá tempo de começar a falar e de pausar no meio da frase sem cortar
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 2500L)
        try { sr.startListening(intent) } catch (_: Exception) { recognizeWithVosk() }
    }

    /** Sem o reconhecimento do Android: usa o próprio Vosk (off-line), um pouco menos preciso. */
    private fun recognizeWithVosk() {
        val m = model ?: return endSession()
        thread(name = "dia-pedido") {
            var text = ""
            var record: AudioRecord? = null
            var rec: Recognizer? = null
            try {
                rec = Recognizer(m, 16000f)
                record = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, 6400)
                record.startRecording()
                val buf = ShortArray(1600)
                val gain = AutoGain()
                val until = System.currentTimeMillis() + 8000
                while (System.currentTimeMillis() < until) {
                    val n = record.read(buf, 0, buf.size)
                    if (n <= 0) continue
                    gain.process(buf, n)
                    if (rec.acceptWaveForm(buf, n)) { text = JSONObject(rec.result).optString("text"); if (text.isNotBlank()) break }
                    else JSONObject(rec.partialResult).optString("partial").takeIf { it.isNotBlank() }?.let { WebEvents.voice("listening", heard = it) }
                }
                if (text.isBlank()) text = JSONObject(rec.finalResult).optString("text")
            } catch (_: Throwable) {
            } finally {
                try { record?.stop() } catch (_: Exception) {}
                record?.release()
                rec?.close()
            }
            main.post { if (text.isBlank()) nothingHeard() else handleText(text) }
        }
    }

    private fun handleText(raw: String) {
        val text = raw.trim()
        if (text.isBlank()) return nothingHeard()
        status = "pensando"
        update("Pensando…")
        WebEvents.voice("processing", heard = text)
        thread(name = "dia-resposta") {
            val reply = if (prefs.url.isBlank() || prefs.token.isBlank()) "Termine de me ativar no tablet: Configurações, App Android."
            else DiaApi.ask(prefs.url, prefs.token, text)
            main.post { speak(text, reply) }
        }
    }

    private fun speak(heard: String, reply: String) {
        status = "falando"
        update("Respondendo…")
        WebEvents.voice("speaking", heard, reply)
        val t = tts
        if (t == null || !ttsReady) return endSession(heard, reply)
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { main.post { endSession(heard, reply) } }
            @Deprecated("API antiga") override fun onError(id: String?) { main.post { endSession(heard, reply) } }
        })
        t.speak(reply, TextToSpeech.QUEUE_FLUSH, null, "dia")
    }

    private fun endSession(heard: String = "", reply: String = "") {
        inSession = false
        WebEvents.voice("idle", heard, reply)
        main.postDelayed({ startListening() }, 400)
    }

    // ---------------- Aviso fixo ----------------

    private fun update(text: String? = null) {
        val msg = text ?: when {
            !prefs.wake -> "Escuta desligada"
            paused -> "Pausado — toque em Retomar"
            model == null -> "Preparando o modelo de voz…"
            else -> "Ouvindo “Oi, Luna”"
        }
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification(msg))
    }

    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val toggle = if (paused) ACTION_RESUME else ACTION_PAUSE
        val action = PendingIntent.getService(this, 1, Intent(this, ListenService::class.java).setAction(toggle), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_dia)
            .setContentTitle("Luna")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, if (paused) "Retomar" else "Pausar", action).build())
            .build()
    }
}
