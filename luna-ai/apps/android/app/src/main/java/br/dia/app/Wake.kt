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
     * Frases que o reconhecedor pode escolher. “Luna” sozinha é curta: o modelo em português
     * muitas vezes ouve “lona”, então as duas valem. As outras são “iscas” para que palavras
     * parecidas e frequentes em casa (“luz”, “lua”, “uma”, “acende/apaga a luz da sala”) não
     * virem “Luna”. Escolhidas no teste com vozes sintéticas.
     */
    const val GRAMMAR = "[\"luna\", \"lona\", \"lua\", \"luz\", \"uma\", \"una\", \"lula\", \"bom dia\", \"acende\", \"apaga\", \"a\", \"da\", \"sala\", \"[unk]\"]"
    private val CALL = setOf("luna", "lona")

    /** Confiança mínima por nível de sensibilidade. */
    fun threshold(sensitivity: String): Float = when (sensitivity) {
        "alta" -> 0.3f
        "baixa" -> 0.55f
        else -> 0.4f
    }

    /** Lê o resultado do Vosk e devolve a confiança do chamado “Luna” (0 se não houver). */
    fun score(json: String): Float {
        val words = JSONObject(json).optJSONArray("result") ?: return 0f
        var best = 0f
        for (k in 0 until words.length()) {
            val w = words.getJSONObject(k)
            if (w.optString("word") in CALL) best = max(best, w.optDouble("conf", 0.0).toFloat())
        }
        return best
    }
}
