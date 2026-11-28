package br.dia.app

import android.content.Context
import android.content.SharedPreferences

/** Configurações do app (ficam só no tablet, na área privada do app). */
class Prefs(ctx: Context) {
    private val p: SharedPreferences = ctx.getSharedPreferences("dia", Context.MODE_PRIVATE)

    /** Endereço da Luna, ex.: http://192.168.15.6:8787 */
    var url: String
        get() = p.getString("url", "") ?: ""
        set(v) = p.edit().putString("url", v.trimEnd('/')).apply()

    /** Token da Siri/Atalhos criado pela própria Luna (só serve para mandar comandos). */
    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) = p.edit().putString("token", v).apply()

    var wake: Boolean
        get() = p.getBoolean("wake", false)
        set(v) = p.edit().putBoolean("wake", v).apply()

    var autostart: Boolean
        get() = p.getBoolean("autostart", true)
        set(v) = p.edit().putBoolean("autostart", v).apply()

    var keepOn: Boolean
        get() = p.getBoolean("keepOn", true)
        set(v) = p.edit().putBoolean("keepOn", v).apply()

    /** Tela cheia: esconde a barra de status e os botões do Android */
    var fullscreen: Boolean
        get() = p.getBoolean("fullscreen", true)
        set(v) = p.edit().putBoolean("fullscreen", v).apply()

    /** Login e preferências da tela já foram levados para a ponte local (127.0.0.1) */
    var localMoved: Boolean
        get() = p.getBoolean("localMoved", false)
        set(v) = p.edit().putBoolean("localMoved", v).apply()

    /** Falar com a voz da Luna (Dii, gerada no servidor) em vez da voz do Android */
    var lunaVoice: Boolean
        get() = p.getBoolean("lunaVoice", true)
        set(v) = p.edit().putBoolean("lunaVoice", v).apply()

    /** Voz do Android escolhida nos ajustes da Luna (nome da voz; vazio = a melhor instalada) */
    var ttsVoice: String
        get() = p.getString("ttsVoice", "") ?: ""
        set(v) = p.edit().putString("ttsVoice", v).apply()

    var ttsRate: Float
        get() = p.getFloat("ttsRate", 1.05f)
        set(v) = p.edit().putFloat("ttsRate", v).apply()

    /** Atualizar o app sozinho quando houver versão nova no servidor */
    var autoUpdate: Boolean
        get() = p.getBoolean("autoUpdate", true)
        set(v) = p.edit().putBoolean("autoUpdate", v).apply()

    /** alta | normal | baixa */
    var sensitivity: String
        get() = p.getString("sensitivity", "normal") ?: "normal"
        set(v) = p.edit().putString("sensitivity", v).apply()

    /** Só vozes cadastradas chamam a Luna: off | observe (só registra) | block (barra as outras) */
    var voiceMode: String
        get() = p.getString("voiceMode", "off") ?: "off"
        set(v) = p.edit().putString("voiceMode", v).apply()

    /** leve | normal | rigido */
    var voiceRigor: String
        get() = p.getString("voiceRigor", "normal") ?: "normal"
        set(v) = p.edit().putString("voiceRigor", v).apply()

    /** Assinaturas de voz por pessoa (JSON; números, não áudio) */
    var voiceProfiles: String
        get() = p.getString("voiceProfiles", "{}") ?: "{}"
        set(v) = p.edit().putString("voiceProfiles", v).apply()
}
