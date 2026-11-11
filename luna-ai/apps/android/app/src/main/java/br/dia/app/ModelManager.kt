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
    fun ensure(ctx: Context): File {
        if (ready(ctx)) return dir(ctx)
        val tmp = File(ctx.cacheDir, "model.zip")
        progress = 0
        try {
            val conn = URL(URL_ZIP).openConnection() as HttpURLConnection
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
            if (hash != SHA256) throw IllegalStateException("O modelo de voz baixado veio corrompido. Tente de novo.")
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
            if (!ready(ctx)) throw IllegalStateException("O modelo de voz não foi instalado direito.")
            return dir(ctx)
        } catch (e: IllegalStateException) {
            throw e
        } catch (e: Exception) {
            throw IllegalStateException("Não consegui baixar o modelo de voz (precisa de internet só nesta primeira vez).")
        } finally {
            tmp.delete()
            progress = -1
        }
    }
}
