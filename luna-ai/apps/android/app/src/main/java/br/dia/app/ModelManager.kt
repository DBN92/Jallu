package br.dia.app

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/**
 * Modelo de fala em português do Vosk (off-line, ~32 MB). Baixado uma vez, conferido pelo
 * SHA-256 e guardado na área privada do app. Depois disso o chamado “Oi, Luna” funciona sem internet.
 */
object ModelManager {
    private const val NAME = "vosk-model-small-pt-0.3"
    private const val URL_ZIP = "https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip"
    private const val SHA256 = "6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7"

    @Volatile var progress: Int = -1 // -1 = parado; 0..100 = baixando

    fun dir(ctx: Context) = File(ctx.filesDir, NAME)
    fun ready(ctx: Context) = File(dir(ctx), "final.mdl").exists()

    /** Garante o modelo no aparelho. Lança exceção com mensagem amigável se falhar. */
    @Synchronized
    fun ensure(ctx: Context): File = fetch(ctx, NAME, URL_ZIP, SHA256, "final.mdl", "modelo de voz")

    // Assinatura de voz (Vosk speaker model, ~13 MB): reconhece QUEM disse “Oi, Luna”
    private const val SPK_NAME = "vosk-model-spk-0.4"
    private const val SPK_URL = "https://alphacephei.com/vosk/models/vosk-model-spk-0.4.zip"
    private const val SPK_SHA256 = "a74d8f51144484813e16af689bb0f916b7a111e2347f467c4933c1166097b5a7"
    fun spkDir(ctx: Context) = File(ctx.filesDir, SPK_NAME)
    fun spkReady(ctx: Context) = File(spkDir(ctx), "final.ext.raw").exists()
    @Synchronized
    fun ensureSpk(ctx: Context): File = fetch(ctx, SPK_NAME, SPK_URL, SPK_SHA256, "final.ext.raw", "modelo de assinatura de voz")

    private fun fetch(ctx: Context, name: String, url: String, sha: String, marker: String, label: String): File {
        val dir = File(ctx.filesDir, name)
        if (File(dir, marker).exists()) return dir
        val tmp = File(ctx.cacheDir, "$name.zip")
        progress = 0
        try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 60_000
            val total = conn.contentLengthLong.coerceAtLeast(1)
            val md = MessageDigest.getInstance("SHA-256")
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { out ->
                    val buf = ByteArray(64 * 1024)
                    var done = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        md.update(buf, 0, n)
                        done += n
                        progress = ((done * 100) / total).toInt().coerceIn(0, 99)
                    }
                }
            }
            val hash = md.digest().joinToString("") { "%02x".format(it) }
            if (hash != sha) throw IllegalStateException("O $label baixado veio corrompido. Tente de novo.")
            val target = ctx.filesDir.canonicalFile
            ZipInputStream(tmp.inputStream()).use { zip ->
                while (true) {
                    val e = zip.nextEntry ?: break
                    val f = File(target, e.name).canonicalFile
                    // Proteção: nada fora da pasta do app
                    if (!f.path.startsWith(target.path + File.separator)) continue
                    if (e.isDirectory) f.mkdirs() else {
                        f.parentFile?.mkdirs()
                        FileOutputStream(f).use { zip.copyTo(it) }
                    }
                }
            }
            if (!File(dir, marker).exists()) throw IllegalStateException("O $label não foi instalado direito.")
            return dir
        } catch (e: IllegalStateException) {
            throw e
        } catch (e: Exception) {
            throw IllegalStateException("Não consegui baixar o $label (precisa de internet só nesta primeira vez).")
        } finally {
            tmp.delete()
            progress = -1
        }
    }
}
