package br.dia.app

import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Ganho automático: quem fala baixo ou longe do tablet chega ao reconhecedor com volume bom.
 * Mede o volume a cada bloco de 100 ms, sobe devagar e desce rápido (sem estourar).
 * Valores escolhidos no teste com vozes sintéticas: alvo 1200, ganho máximo 10x.
 */
class AutoGain(private val target: Float = 1200f, private val maxGain: Float = 10f) {
    private var gain = 1f

    fun process(buf: ShortArray, n: Int) {
        var i = 0
        while (i < n) {
            val end = min(n, i + 1600)
            var sum = 0.0
            for (k in i until end) sum += buf[k].toDouble() * buf[k]
            val rms = sqrt(sum / max(1, end - i)).toFloat()
            // Silêncio absoluto: mantém o ganho atual
            val want = if (rms > 25f) min(maxGain, max(1f, target / rms)) else gain
            gain += (want - gain) * (if (want < gain) 0.5f else 0.15f)
            for (k in i until end) {
                val v = buf[k] * gain
                buf[k] = v.coerceIn(-32768f, 32767f).toInt().toShort()
            }
            i = end
        }
    }
}

object WakeMatch {
    /**
     * Frases que o reconhecedor pode escolher. O chamado é “oi luna” (o modelo em português às
     * vezes ouve “oi lona”, então as duas valem). As outras são “iscas”: “luna” sozinha, “oi”,
     * “lua”, “luz” e “bom dia” não viram chamado. Escolhidas no teste com vozes sintéticas
     * (80% de acerto com fala normal, nenhum engano nas frases comuns).
     */
    const val GRAMMAR = "[\"oi luna\", \"oi lona\", \"oi\", \"luna\", \"lua\", \"luz\", \"bom dia\", \"[unk]\"]"
    private val NAME = setOf("luna", "lona")

    /** Confiança mínima por nível de sensibilidade. */
    fun threshold(sensitivity: String): Float = when (sensitivity) {
        "alta" -> 0.35f
        "baixa" -> 0.65f
        else -> 0.5f
    }

    /**
     * “Oi Luna, acende a luz” num fôlego só: devolve em que segundo terminou o nome (“luna”) quando
     * há mais fala depois dele na mesma frase; null quando a pessoa disse só “Oi, Luna”.
     */
    fun tailStart(json: String): Double? {
        val words = JSONObject(json).optJSONArray("result") ?: return null
        for (k in 0 until words.length() - 1) {
            val a = words.getJSONObject(k)
            val b = words.getJSONObject(k + 1)
            if (a.optString("word") == "oi" && b.optString("word") in NAME) {
                return if (k + 2 < words.length()) b.optDouble("end", -1.0).takeIf { it >= 0 } else null
            }
        }
        return null
    }

    /** Tira o chamado e cortesias do começo do texto transcrito (“oi luna acende” → “acende”). */
    fun stripWake(text: String): String =
        text.trim().replace(Regex("^(oi\\s+)?(luna|lona)\\b[,\\s]*", RegexOption.IGNORE_CASE), "").trim()

    /** Lê o resultado do Vosk e devolve a confiança do “oi luna” (0 se não houver). */
    fun score(json: String): Float {
        val words = JSONObject(json).optJSONArray("result") ?: return 0f
        var best = 0f
        for (k in 0 until words.length() - 1) {
            val a = words.getJSONObject(k)
            val b = words.getJSONObject(k + 1)
            if (a.optString("word") == "oi" && b.optString("word") in NAME) {
                best = max(best, ((a.optDouble("conf", 0.0) + b.optDouble("conf", 0.0)) / 2).toFloat())
            }
        }
        return best
    }
}
