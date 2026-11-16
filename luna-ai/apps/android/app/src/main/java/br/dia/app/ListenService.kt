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
import org.vosk.SpeakerModel
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
        /** Grava uma amostra de “Oi, Luna” para a assinatura de voz (extra “name”) */
        const val ACTION_ENROLL = "br.dia.app.ENROLL"
        private const val CHANNEL = "escuta"
        private const val NOTIF_ID = 7

        @Volatile var status: String = "parado"
            private set(v) {
                if (field != v && (v.startsWith("erro") || v.startsWith("sem ") || v == "parado" || v == "ouvindo" || v.startsWith("reconhecimento"))) AppDiag.log("escuta: $v")
                field = v
            }

        /** A tela da Luna está aberta com a voz em tempo real (OpenAI): ela conduz a conversa */
        @Volatile var handoff = false

        fun send(ctx: Context, action: String, name: String? = null) {
            val i = Intent(ctx, ListenService::class.java).setAction(action)
            if (name != null) i.putExtra("name", name)
            // Sem o microfone liberado o Android nem deixa o serviço ligar: mostra o motivo em vez de “parado”
            if (action != ACTION_STOP && ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                status = "sem permissão de microfone"
                AppDiag.log("escuta: sem permissão de microfone")
                return
            }
            try {
                if (action == ACTION_STOP) ctx.startService(i) else ctx.startForegroundService(i)
            } catch (e: Exception) {
                // Android 12+ não deixa iniciar o microfone em segundo plano: abre o app para iniciar
                status = "erro ao ligar a escuta: ${e.javaClass.simpleName}"
                AppDiag.log("escuta: não ligou (${e.javaClass.simpleName}: ${e.message})")
            }
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var prefs: Prefs
    private var model: Model? = null
    /** Modelo de assinatura de voz (só carregado se o reconhecimento de quem fala estiver em uso) */
    @Volatile private var spkModel: SpeakerModel? = null
    @Volatile private var enrolling = false
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
        AppDiag.init(prefs)
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
        } catch (e: Exception) {
            status = "erro ao ligar a escuta: ${e.javaClass.simpleName}"
            AppDiag.log("escuta: o Android recusou (${e.javaClass.simpleName}: ${e.message})")
            stopSelf()
            return
        }
        AppDiag.log("escuta: serviço ligado")
        // Tablet na tomada: mantém o processador acordado para ouvir com a tela desligada
        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dia:escuta").apply { acquire() }
        tts = AndroidVoice.create(this, prefs) { ttsReady = true }
        loadModel()
        // A cada 3 h confere se há versão nova do app (tablet fica dias sem fechar a Luna)
        main.postDelayed(object : Runnable { override fun run() { AppUpdater.check(this@ListenService, prefs); main.postDelayed(this, 3 * 3600_000L) } }, 60_000)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> { paused = true; status = "pausado"; AppDiag.log("escuta: pausada pela tela"); speech?.cancel(); stopListening(); update() }
            ACTION_RESUME -> {
                paused = false
                // Reconhecimento de quem fala ligado agora: carrega a assinatura de voz (se já baixada)
                if (prefs.voiceMode != "off" && spkModel == null && ModelManager.spkReady(this)) spkModel = try { SpeakerModel(ModelManager.spkDir(this).absolutePath) } catch (_: Throwable) { null }
                startListening()
            }
            ACTION_ENROLL -> enroll(intent.getStringExtra("name").orEmpty())
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
        spkModel?.close()
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
                if (prefs.voiceMode != "off" && ModelManager.spkReady(this)) spkModel = try { SpeakerModel(ModelManager.spkDir(this).absolutePath) } catch (_: Throwable) { null }
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
        if (paused || inSession || listening || enrolling || !prefs.wake) { update(); return }
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
                        // Diagnóstico: cada vez que algo pareceu “oi luna”, aceito ou não
                        if (score > 0f) AppDiag.log("chamado ${if (score >= threshold) "aceito" else "recusado"}: confiança ${"%.2f".format(score)} (mínimo ${"%.2f".format(threshold)}, sensibilidade ${prefs.sensitivity})")
                        if (score >= threshold && now - lastWake > 2500 && !voiceAllows(json, utter.toByteArray(), uttStart)) {
                            // voz que não é de quem foi cadastrado (ex.: TV): ignora e continua ouvindo
                            lastWake = now
                            utter.reset()
                            uttStart = fed
                            continue
                        }
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
                // Pedido junto com o chamado: só responde direto se a transcrição saiu clara (frase com
                // confiança alta). Senão toca o bip e escuta com o reconhecimento do Android, que é melhor;
                // o trecho fica guardado para usar se depois do bip ninguém falar nada.
                val (text, conf, words) = transcribe(said)
                main.post {
                    AppDiag.log("pedido junto do chamado (Vosk): “${text.take(100)}” confiança ${"%.2f".format(conf)}${if (WakeMatch.tailIsClear(text, conf, words)) "" else " — ouvindo de novo pelo Google"}")
                    if (WakeMatch.tailIsClear(text, conf, words)) commandFromWake(text)
                    else { pendingTail = if (words >= 2) text else ""; beginCommand() }
                }
            } else if (triggered) main.post { pendingTail = ""; beginCommand() }
            else if (!paused && !inSession && prefs.wake && status == "erro no microfone") main.postDelayed({ startListening() }, 3000)
        }
    }

    // ---------------- Quem está falando (assinatura de voz) ----------------

    private fun profiles() = VoiceId.parse(prefs.voiceProfiles)

    /** PCM 16 bits (bytes little-endian) → amostras */
    private fun toShorts(bytes: ByteArray, from: Int, to: Int): ShortArray =
        ShortArray(((to - from) / 2).coerceAtLeast(0)) { i -> ((bytes[from + i * 2].toInt() and 0xff) or (bytes[from + i * 2 + 1].toInt() shl 8)).toShort() }

    /** Assinatura de voz só do trecho “oi luna” (com 0,35 s de folga dos dois lados) */
    private fun speakerVector(json: String, bytes: ByteArray, uttStart: Long): DoubleArray? {
        val m = model ?: return null
        val spk = spkModel ?: return null
        val (start, end) = WakeMatch.span(json) ?: return null
        val from = (((start - 0.35) * 16000).toLong() - uttStart).coerceIn(0, bytes.size / 2L).toInt() * 2
        val to = (((end + 0.35) * 16000).toLong() - uttStart).coerceIn(0, bytes.size / 2L).toInt() * 2
        if (to - from < 16000 / 4 * 2) return null
        val clip = toShorts(bytes, from, to)
        return try {
            Recognizer(m, 16000f, WakeMatch.GRAMMAR).use { r ->
                r.setSpeakerModel(spk)
                var i = 0
                while (i < clip.size) { val n = minOf(1600, clip.size - i); r.acceptWaveForm(clip.copyOfRange(i, i + n), n); i += n }
                VoiceId.vector(r.finalResult)
            }
        } catch (_: Throwable) { null }
    }

    /**
     * O chamado veio de quem foi cadastrado? Desligado ou sem cadastro: sempre sim. Em “observar” só
     * registra no diagnóstico; em “barrar” recusa vozes estranhas (sem assinatura, deixa passar).
     */
    private fun voiceAllows(json: String, bytes: ByteArray, uttStart: Long): Boolean {
        val mode = prefs.voiceMode
        if (mode == "off" || WakeMatch.score(json) <= 0f) return true
        val people = profiles()
        if (people.values.none { it.size >= VoiceId.MIN_SAMPLES } || spkModel == null) return true
        val v = speakerVector(json, bytes, uttStart)
        if (v == null) { AppDiag.log("voz: sem assinatura (trecho curto) — deixei passar"); return true }
        val m = VoiceId.identify(v, people, prefs.voiceRigor)
        val others = m.others.joinToString { "${it.first} ${"%.2f".format(it.second)}" }
        val verdict = when {
            m.name != null -> "reconheci ${m.name}"
            mode == "block" -> "voz desconhecida — ignorei"
            else -> "voz desconhecida — teria ignorado (modo observar)"
        }
        AppDiag.log("voz: $verdict · mais parecida: ${m.closest} ${"%.2f".format(m.similarity)}${if (others.isNotEmpty()) " (outros: $others)" else ""} · limite ${"%.2f".format(VoiceId.threshold(prefs.voiceRigor))}")
        return m.name != null || mode != "block"
    }

    /** Cadastro: bip, grava ~3,5 s, acha o “oi luna” e guarda a assinatura dessa pessoa */
    private fun enroll(name: String) {
        val who = name.trim().take(30)
        if (who.isEmpty()) return
        if (inSession || enrolling) { WebEvents.enroll("erro", who, message = "A Luna está ocupada agora. Tente de novo em instantes."); return }
        if (!hasMic()) { WebEvents.enroll("erro", who, message = "Permita o microfone no app da Luna."); return }
        enrolling = true
        stopListening()
        thread(name = "dia-cadastro-voz") {
            var record: AudioRecord? = null
            try {
                val m = model ?: throw IllegalStateException("O modelo de voz ainda está sendo preparado.")
                if (spkModel == null) {
                    if (!ModelManager.spkReady(this)) WebEvents.enroll("baixando", who)
                    spkModel = SpeakerModel(ModelManager.ensureSpk(this).absolutePath)
                }
                WebEvents.enroll("gravando", who)
                try { ToneGenerator(AudioManager.STREAM_MUSIC, 70).startTone(ToneGenerator.TONE_PROP_ACK, 160) } catch (_: Exception) {}
                Thread.sleep(250)
                val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                record = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(min, 6400))
                record.startRecording()
                // Mesmo tratamento da escuta (ganho automático), para a assinatura sair igual
                val total = ShortArray(16000 * 7 / 2)
                val chunk = ShortArray(1600)
                var got = 0
                val gain = AutoGain()
                while (got < total.size) {
                    val n = record.read(chunk, 0, minOf(chunk.size, total.size - got))
                    if (n <= 0) continue
                    gain.process(chunk, n)
                    chunk.copyInto(total, got, 0, n)
                    got += n
                }
                record.stop()
                // Acha o “oi luna” na gravação
                val results = mutableListOf<String>()
                Recognizer(m, 16000f, WakeMatch.GRAMMAR).use { r ->
                    r.setWords(true)
                    var i = 0
                    while (i < got) { val n = minOf(1600, got - i); if (r.acceptWaveForm(total.copyOfRange(i, i + n), n)) results += r.result; i += n }
                    results += r.finalResult
                }
                val json = results.firstOrNull { WakeMatch.span(it) != null && WakeMatch.score(it) > 0f }
                    ?: throw IllegalStateException("Não ouvi “Oi, Luna”. Fale logo depois do bip, no seu tom normal.")
                val bytes = ByteArray(got * 2).also { b -> for (k in 0 until got) { b[k * 2] = (total[k].toInt() and 0xff).toByte(); b[k * 2 + 1] = ((total[k].toInt() shr 8) and 0xff).toByte() } }
                val v = speakerVector(json, bytes, 0) ?: throw IllegalStateException("A gravação ficou curta demais. Tente de novo.")
                val all = profiles()
                val list = all.getOrPut(who) { mutableListOf() }
                list += v
                while (list.size > VoiceId.MAX_SAMPLES) list.removeAt(0)
                prefs.voiceProfiles = VoiceId.serialize(all)
                AppDiag.log("voz: amostra ${list.size} de $who cadastrada")
                WebEvents.enroll("ok", who, list.size)
            } catch (e: Throwable) {
                WebEvents.enroll("erro", who, message = e.message ?: "Não consegui gravar.")
            } finally {
                try { record?.release() } catch (_: Exception) {}
                enrolling = false
                main.post { startListening() }
            }
        }
    }

    /** Transcreve um trecho de áudio já gravado com o Vosk (off-line, sem a lista restrita do chamado). */
    private fun transcribe(pcm: ShortArray): Triple<String, Float, Int> {
        val m = model ?: return Triple("", 0f, 0)
        return try {
            Recognizer(m, 16000f).use { r ->
                r.setWords(true)
                var i = 0
                val parts = StringBuilder()
                val confs = mutableListOf<Double>()
                fun take(json: String) {
                    val o = JSONObject(json)
                    parts.append(' ').append(o.optString("text"))
                    o.optJSONArray("result")?.let { a -> for (k in 0 until a.length()) confs += a.getJSONObject(k).optDouble("conf", 0.0) }
                }
                while (i < pcm.size) {
                    val n = minOf(1600, pcm.size - i)
                    if (r.acceptWaveForm(pcm.copyOfRange(i, i + n), n)) take(r.result)
                    i += n
                }
                take(r.finalResult)
                val text = WakeMatch.stripWake(parts.toString().trim().replace(Regex("\\s+"), " "))
                Triple(text, if (confs.isEmpty()) 0f else confs.average().toFloat(), text.split(' ').count { it.isNotBlank() })
            }
        } catch (_: Throwable) { Triple("", 0f, 0) }
    }

    /** Pedido que veio junto com o chamado mas não estava claro (usado se depois do bip ninguém falar) */
    private var pendingTail = ""

    /** O pedido veio na mesma frase do chamado: confirma com o bip e responde, sem pedir de novo. */
    private fun commandFromWake(text: String) {
        if (inSession) return
        inSession = true
        DiaApi.duck(prefs.url, prefs.token, true)
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
        // A TV escolhida fica no mudo enquanto a Luna escuta (o microfone misturava a TV com o pedido)
        DiaApi.duck(prefs.url, prefs.token, true)
        // Voz em tempo real ligada e a Luna na frente: passa a conversa para a tela (mesma voz e IA do celular)
        if (handoff && MainActivity.visible && WebEvents.attached()) {
            stopListening()
            tts?.stop()
            try { ToneGenerator(AudioManager.STREAM_MUSIC, 70).startTone(ToneGenerator.TONE_PROP_ACK, 160) } catch (_: Exception) {}
            WebEvents.wakeWord()
            // A tela pausa a escuta enquanto conversa; se ela não assumir, volta a escutar sozinho
            main.postDelayed({ if (!paused && !inSession && !listening) startListening() }, 4000)
            return
        }
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

    /**
     * Quantas vezes seguidas o reconhecimento do Android falhou na hora (antes de a pessoa falar).
     * Em alguns tablets ele recusa ser chamado por outro app; depois de 2 falhas, usa direto o off-line.
     */
    private var androidFastFails = 0

    private fun listenForCommand() {
        if (androidFastFails < 2 && SpeechRecognizer.isRecognitionAvailable(this)) recognizeWithAndroid() else recognizeWithVosk()
    }

    /** Prefere o reconhecimento do Google (o padrão de alguns tablets Samsung recusa outros apps) */
    private fun createRecognizer(): SpeechRecognizer {
        val google = try {
            packageManager.queryIntentServices(Intent(android.speech.RecognitionService.SERVICE_INTERFACE), 0)
                .firstOrNull { it.serviceInfo.packageName == "com.google.android.googlequicksearchbox" || it.serviceInfo.packageName == "com.google.android.tts" }
                ?.serviceInfo?.let { android.content.ComponentName(it.packageName, it.name) }
        } catch (_: Exception) { null }
        return if (google != null) SpeechRecognizer.createSpeechRecognizer(this, google) else SpeechRecognizer.createSpeechRecognizer(this)
    }

    /** Não ouviu nada: pergunta uma vez “Pode repetir?” e escuta de novo; na segunda, avisa e encerra. */
    private fun nothingHeard() {
        // A pessoa já tinha falado o pedido junto com o “Oi, Luna”: usa o que deu para entender
        if (pendingTail.isNotBlank()) {
            val t = pendingTail
            pendingTail = ""
            return handleText(t)
        }
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
        LunaVoice.play(this, prefs, text, onDone = next, onFail = { sayThenAndroid(text, next) })
    }

    private fun sayThenAndroid(text: String, next: () -> Unit) {
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
        val sr = try { createRecognizer() } catch (_: Exception) { return recognizeWithVosk() }
        speech = sr
        var lastPartial = ""
        val started = System.currentTimeMillis()
        var heardVoice = false
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
                if (t.isNotBlank()) androidFastFails = 0
                if (t.isBlank()) nothingHeard() else handleText(t)
            }
            override fun onError(error: Int) {
                if (done) return
                done = true
                // Falhou antes de a pessoa falar (em menos de 2,5 s): o problema é o reconhecedor, não a fala
                val fast = !heardVoice && System.currentTimeMillis() - started < 2500
                status = "reconhecimento do Android: erro $error"
                when {
                    lastPartial.isNotBlank() -> handleText(lastPartial)
                    fast && !busyRetry && (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) ->
                        main.postDelayed({ recognizeWithAndroid(busyRetry = true) }, 600)
                    // Não deu para usar o do Android: escuta com o off-line, sem dizer “não ouvi”
                    fast -> { androidFastFails++; main.post { speech?.destroy(); speech = null; recognizeWithVosk() } }
                    // Reconhecedor ainda preso na vez anterior: tenta de novo uma vez
                    !busyRetry && (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) ->
                        main.postDelayed({ recognizeWithAndroid(busyRetry = true) }, 500)
                    // Sem internet para o reconhecimento do Google: usa o off-line
                    error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || error == SpeechRecognizer.ERROR_SERVER -> recognizeWithVosk()
                    else -> nothingHeard()
                }
            }
            override fun onReadyForSpeech(p: Bundle?) {}
            override fun onBeginningOfSpeech() { heardVoice = true }
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
                // O microfone pode levar um instante para ser solto pelo reconhecedor do Android
                for (attempt in 0 until 6) {
                    val r = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, 6400)
                    if (r.state == AudioRecord.STATE_INITIALIZED) {
                        r.startRecording()
                        if (r.recordingState == AudioRecord.RECORDSTATE_RECORDING) { record = r; break }
                        try { r.stop() } catch (_: Exception) {}
                    }
                    r.release()
                    Thread.sleep(300)
                }
                if (record == null) throw IllegalStateException("microfone ocupado")
                WebEvents.voice("listening")
                val buf = ShortArray(1600)
                val gain = AutoGain()
                val until = System.currentTimeMillis() + 8000
                while (System.currentTimeMillis() < until) {
                    val n = record!!.read(buf, 0, buf.size)
                    if (n <= 0) continue
                    gain.process(buf, n)
                    if (rec.acceptWaveForm(buf, n)) { text = WakeMatch.stripWake(JSONObject(rec.result).optString("text")); if (text.length >= 2) break }
                    else JSONObject(rec.partialResult).optString("partial").takeIf { it.isNotBlank() }?.let { WebEvents.voice("listening", heard = it) }
                }
                if (text.length < 2) text = WakeMatch.stripWake(JSONObject(rec.finalResult).optString("text"))
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
        AppDiag.log("pedido entendido: “${text.take(100)}”")
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
        // Voz da Luna (Dii, gerada no servidor); se não der, a voz do Android
        LunaVoice.play(this, prefs, reply, onDone = { endSession(heard, reply) }, onFail = { speakAndroid(heard, reply) })
    }

    private fun speakAndroid(heard: String, reply: String) {
        val t = tts
        // Voz escolhida nos ajustes da Luna (pode ter mudado desde que a escuta ligou)
        if (t != null && ttsReady) AndroidVoice.configure(t, prefs)
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
        DiaApi.duck(prefs.url, prefs.token, false)
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
