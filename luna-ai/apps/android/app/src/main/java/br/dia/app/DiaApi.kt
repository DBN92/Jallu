package br.dia.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Manda o pedido para a DIA (mesmo caminho da Siri) e devolve a resposta em texto. */
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
            if (code == 401) "Preciso ser ativada de novo. Abra a DIA no tablet, em Configurações, App Android." else body.ifBlank { "Pronto." }
        } catch (e: Exception) {
            "Não consegui falar com o servidor da DIA."
        } finally {
            conn.disconnect()
        }
    }
}
