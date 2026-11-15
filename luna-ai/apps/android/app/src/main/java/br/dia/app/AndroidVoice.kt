package br.dia.app

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Voz do Android com a melhor qualidade possível: usa o mecanismo do Google quando instalado (o da
 * Samsung é mais robótico) e a voz em português do Brasil escolhida nos ajustes da Luna — ou a de
 * melhor qualidade instalada no tablet.
 */
object AndroidVoice {
    const val GOOGLE = "com.google.android.tts"

    fun googleInstalled(ctx: Context) = try { ctx.packageManager.getPackageInfo(GOOGLE, 0); true } catch (_: Exception) { false }

    /** Cria a voz já configurada; onReady roda quando ela estiver pronta para falar */
    fun create(ctx: Context, prefs: Prefs, onReady: (TextToSpeech) -> Unit): TextToSpeech {
        lateinit var t: TextToSpeech
        val listener = TextToSpeech.OnInitListener { st ->
            if (st == TextToSpeech.SUCCESS) {
                configure(t, prefs)
                onReady(t)
            }
        }
        t = if (googleInstalled(ctx)) TextToSpeech(ctx, listener, GOOGLE) else TextToSpeech(ctx, listener)
        return t
    }

    /** Vozes em português do Brasil já instaladas, das melhores para as piores */
    fun ptVoices(t: TextToSpeech): List<Voice> = try {
        (t.voices ?: emptySet()).filter { v ->
            v.locale.language == "pt" && (v.locale.country.isEmpty() || v.locale.country.equals("BR", true)) &&
                !v.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
        }.sortedWith(compareByDescending<Voice> { it.quality }.thenBy { it.isNetworkConnectionRequired }.thenBy { it.name })
    } catch (_: Exception) { emptyList() }

    fun configure(t: TextToSpeech, prefs: Prefs) {
        try {
            t.language = Locale("pt", "BR")
            val all = ptVoices(t)
            val chosen = all.firstOrNull { it.name == prefs.ttsVoice } ?: all.firstOrNull { !it.isNetworkConnectionRequired } ?: all.firstOrNull()
            if (chosen != null) t.voice = chosen
            t.setSpeechRate(prefs.ttsRate)
            t.setPitch(1.0f)
        } catch (_: Exception) {}
    }

    /** Para a tela de ajustes: mecanismo, voz atual e vozes disponíveis */
    fun describe(ctx: Context, t: TextToSpeech?, prefs: Prefs): String {
        val o = JSONObject().put("google", googleInstalled(ctx)).put("engine", t?.defaultEngine ?: "").put("current", prefs.ttsVoice).put("rate", prefs.ttsRate.toDouble())
        val arr = JSONArray()
        if (t != null) ptVoices(t).forEach { v ->
            arr.put(JSONObject().put("name", v.name).put("quality", v.quality).put("network", v.isNetworkConnectionRequired))
        }
        return o.put("ready", t != null).put("voices", arr).toString()
    }
}
