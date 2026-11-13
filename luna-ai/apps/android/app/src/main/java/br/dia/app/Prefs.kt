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

    /** alta | normal | baixa */
    var sensitivity: String
        get() = p.getString("sensitivity", "normal") ?: "normal"
        set(v) = p.edit().putString("sensitivity", v).apply()
}
