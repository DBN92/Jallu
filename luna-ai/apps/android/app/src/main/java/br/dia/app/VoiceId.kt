package br.dia.app

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.sqrt

/**
 * “Só a minha voz e a da Natália chamam a Luna”: cada pessoa grava algumas vezes “Oi, Luna” e o app
 * guarda a ASSINATURA de voz de cada gravação (128 números do modelo de locutor do Vosk — não é áudio).
 * Ao ouvir o chamado, compara a assinatura do trecho “oi luna” com a média de cada pessoa.
 *
 * Calibrado com vozes sintéticas diferentes: pessoas cadastradas ficaram acima de 0,56 e vozes
 * estranhas no máximo em 0,47 (com TV ao fundo, as cadastradas caem um pouco, ~0,48). Voz real varia
 * mais: por isso começa em “observar” (só registra) e o diagnóstico mostra cada comparação.
 */
object VoiceId {
    const val MIN_SAMPLES = 3
    const val MAX_SAMPLES = 12

    /** Semelhança mínima por rigor */
    fun threshold(rigor: String): Double = when (rigor) {
        "leve" -> 0.40
        "rigido" -> 0.55
        else -> 0.47
    }

    /** name = quem passou do limite (null = ninguém); closest = a pessoa mais parecida, mesmo abaixo do limite */
    data class Match(val name: String?, val similarity: Double, val closest: String?, val others: List<Pair<String, Double>>)

    fun cosine(a: DoubleArray, b: DoubleArray): Double {
        var dot = 0.0; var na = 0.0; var nb = 0.0
        for (i in a.indices) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
        return if (na == 0.0 || nb == 0.0) 0.0 else dot / sqrt(na * nb)
    }

    fun mean(samples: List<DoubleArray>): DoubleArray {
        val out = DoubleArray(samples.first().size)
        for (s in samples) for (i in out.indices) out[i] += s[i] / samples.size
        return out
    }

    /** Assinatura no resultado do Vosk (campo “spk”), ou null se o trecho foi curto demais */
    fun vector(json: String): DoubleArray? {
        val arr = JSONObject(json).optJSONArray("spk") ?: return null
        if (arr.length() == 0) return null
        return DoubleArray(arr.length()) { arr.getDouble(it) }
    }

    /** Quem disse? A pessoa mais parecida (só pessoas com amostras suficientes) e se passou do limite */
    fun identify(v: DoubleArray, profiles: Map<String, List<DoubleArray>>, rigor: String): Match {
        val scores = profiles.filter { it.value.size >= MIN_SAMPLES }.map { (name, s) -> name to cosine(v, mean(s)) }.sortedByDescending { it.second }
        val best = scores.firstOrNull() ?: return Match(null, 0.0, null, emptyList())
        return Match(if (best.second >= threshold(rigor)) best.first else null, best.second, best.first, scores.drop(1))
    }

    // ---------- Guardar/ler (JSON nas preferências do app) ----------

    fun parse(json: String): MutableMap<String, MutableList<DoubleArray>> {
        val out = linkedMapOf<String, MutableList<DoubleArray>>()
        try {
            val o = JSONObject(json)
            for (name in o.keys()) {
                val arr = o.getJSONArray(name)
                out[name] = MutableList(arr.length()) { i -> arr.getJSONArray(i).let { a -> DoubleArray(a.length()) { a.getDouble(it) } } }
            }
        } catch (_: Exception) {}
        return out
    }

    fun serialize(p: Map<String, List<DoubleArray>>): String {
        val o = JSONObject()
        for ((name, list) in p) o.put(name, JSONArray().apply { list.forEach { v -> put(JSONArray().apply { v.forEach { put(Math.round(it * 10000) / 10000.0) } }) } })
        return o.toString()
    }
}
