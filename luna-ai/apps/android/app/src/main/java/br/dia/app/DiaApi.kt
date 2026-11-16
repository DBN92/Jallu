package br.dia.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Manda o pedido para a Luna (mesmo caminho da Siri) e devolve a resposta em texto. */
object DiaApi {
    fun ask(baseUrl: String, token: String, text: String): String {
        val conn = URL("$baseUrl/api/siri/ask").openConnection() as HttpURLConnection
        return try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 8_000
            conn.readTimeout = 90_000 // a IA local pode demorar em perguntas livres
            conn.doOutput = true
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.outputStream.use { it.write(JSONObject().put("texto", text).toString().toByteArray()) }
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code == 401) "Preciso ser ativada de novo. Abra a Luna no tablet, em Configurações, App Android." else body.ifBlank { "Pronto." }
        } catch (e: Exception) {
            "Não consegui falar com o servidor da Luna."
        } finally {
            conn.disconnect()
        }
    }

    /** Avisa o servidor que a Luna começou (on) ou terminou (off) de escutar: a TV escolhida fica no mudo */
    fun duck(baseUrl: String, token: String, on: Boolean) {
        if (baseUrl.isBlank() || token.isBlank()) return
        Thread {
            val conn = try { URL("$baseUrl/api/tv/duck").openConnection() as HttpURLConnection } catch (_: Exception) { return@Thread }
            try {
                conn.requestMethod = "POST"
                conn.connectTimeout = 3_000
                conn.readTimeout = 5_000
                conn.doOutput = true
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(JSONObject().put("on", on).toString().toByteArray()) }
                conn.responseCode
            } catch (_: Exception) {
            } finally {
                conn.disconnect()
            }
        }.start()
    }

    /** Resposta especial: transcrição na nuvem desligada nos ajustes da Luna */
    const val TRANSCRIBE_OFF = "\u0000off"

    /**
     * Manda o áudio do pedido (já gravado) para o servidor transcrever (Whisper). Devolve o texto,
     * TRANSCRIBE_OFF se a pessoa não permitiu transcrição na nuvem, ou null se falhou (usa o Vosk).
     */
    fun transcribe(baseUrl: String, token: String, pcm: ShortArray): String? {
        if (baseUrl.isBlank() || token.isBlank()) return null
        val boundary = "luna${System.nanoTime()}"
        val wav = wav16k(pcm)
        val conn = try { URL("$baseUrl/api/voice/transcribe").openConnection() as HttpURLConnection } catch (_: Exception) { return null }
        return try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 3_000
            conn.readTimeout = 8_000
            conn.doOutput = true
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            conn.outputStream.use { o ->
                o.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"pedido.wav\"\r\nContent-Type: audio/wav\r\n\r\n".toByteArray())
                o.write(wav)
                o.write("\r\n--$boundary--\r\n".toByteArray())
            }
            when (conn.responseCode) {
                200 -> JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).optString("text").trim()
                403 -> TRANSCRIBE_OFF
                else -> null
            }
        } catch (_: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }

    /** PCM 16 kHz mono → WAV */
    fun wav16k(pcm: ShortArray): ByteArray {
        val data = pcm.size * 2
        val b = java.nio.ByteBuffer.allocate(44 + data).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray()).putInt(36 + data).put("WAVE".toByteArray())
        b.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(16000).putInt(32000).putShort(2).putShort(16)
        b.put("data".toByteArray()).putInt(data)
        for (v in pcm) b.putShort(v)
        return b.array()
    }
}
