package br.dia.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread

/**
 * Atualização automática do app: de tempos em tempos pergunta ao servidor da Luna se há versão nova,
 * baixa, confere a integridade (sha256) e instala. Com “Instalar apps desconhecidos” liberado para a
 * Luna, o Android (12+) deixa o app se atualizar sem pedir confirmação; senão, mostra o pedido normal.
 * Nunca instala no meio de uma conversa por voz.
 */
object AppUpdater {
    @Volatile var status = "sem verificar"
        private set
    @Volatile private var running = false
    private var lastCheck = 0L

    fun canInstall(ctx: Context) = ctx.packageManager.canRequestPackageInstalls()

    /** Confere se há versão nova (no máximo a cada 3 h, ou já se force) */
    fun check(ctx: Context, prefs: Prefs, force: Boolean = false) {
        val app = ctx.applicationContext
        if (running || prefs.url.isBlank() || prefs.token.isBlank()) return
        if (!force && (!prefs.autoUpdate || System.currentTimeMillis() - lastCheck < 3 * 3600_000L)) return
        lastCheck = System.currentTimeMillis()
        running = true
        thread(name = "luna-atualizacao", isDaemon = true) {
            try {
                val info = JSONObject(get(prefs, "/api/android/version").decodeToString())
                val code = info.optInt("versionCode")
                if (code <= BuildConfig.VERSION_CODE) { status = "atualizado (${BuildConfig.VERSION_NAME})"; return@thread }
                val name = info.optString("versionName")
                status = "baixando a versão $name"
                AppDiag.log("atualização: baixando $name")
                val apk = get(prefs, "/api/android/apk")
                val sha = MessageDigest.getInstance("SHA-256").digest(apk).joinToString("") { "%02x".format(it) }
                if (sha != info.optString("sha256")) { status = "arquivo da versão $name não confere; tento depois"; AppDiag.log("atualização: sha256 não confere"); return@thread }
                val file = File(app.cacheDir, "luna-$code.apk").apply { writeBytes(apk) }
                // Espera a conversa por voz acabar (até 10 min)
                var waited = 0
                while (ListenService.status in setOf("ouvindo o pedido", "pensando", "falando") && waited < 600) { Thread.sleep(1000); waited++ }
                status = "instalando a versão $name"
                AppDiag.log("atualização: instalando $name (sem confirmação: ${canInstall(app)})")
                install(app, file)
            } catch (e: Exception) {
                status = "não consegui verificar: ${e.javaClass.simpleName}"
                AppDiag.log("atualização: erro ${e.javaClass.simpleName}: ${e.message}")
            } finally {
                running = false
            }
        }
    }

    private fun get(prefs: Prefs, path: String): ByteArray {
        val c = URL("${prefs.url}$path").openConnection() as HttpURLConnection
        return try {
            c.connectTimeout = 8000; c.readTimeout = 60_000
            c.setRequestProperty("Authorization", "Bearer ${prefs.token}")
            if (c.responseCode != 200) throw IllegalStateException("HTTP ${c.responseCode}")
            c.inputStream.use { it.readBytes() }
        } finally { c.disconnect() }
    }

    private fun install(ctx: Context, apk: File) {
        val pi = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(ctx.packageName)
            // Android 12+: o próprio app se atualizando não precisa de confirmação
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = pi.createSession(params)
        pi.openSession(id).use { s ->
            s.openWrite("luna.apk", 0, apk.length()).use { out -> apk.inputStream().use { it.copyTo(out) }; s.fsync(out) }
            val intent = Intent(ctx, UpdateReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getBroadcast(ctx, id, intent, flags).intentSender)
        }
    }
}

/** Resultado da instalação: pede confirmação quando o Android exigir; registra o resto */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        AppDiag.init(Prefs(ctx))
        when (val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                AppDiag.log("atualização: o Android pediu confirmação")
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirm != null) try { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
            }
            PackageInstaller.STATUS_SUCCESS -> AppDiag.log("atualização: instalada")
            else -> AppDiag.log("atualização: falhou ($st) ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""}")
        }
    }
}
