package br.dia.app

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import org.json.JSONObject
import java.lang.ref.WeakReference

/** Avisa a tela da Luna (aberta no app) sobre a conversa por voz, para mostrar a animação. */
object WebEvents {
    private var view: WeakReference<WebView>? = null
    private val main = Handler(Looper.getMainLooper())

    fun attach(w: WebView?) {
        view = w?.let { WeakReference(it) }
    }

    fun attached() = view?.get() != null

    /** Presença pela câmera do app: quanto a imagem mudou (0–1) e a claridade (0–255) */
    fun motion(level: Float, light: Float) {
        val js = "window.dispatchEvent(new CustomEvent('dia-native-motion',{detail:{level:$level,light:$light}}))"
        main.post { view?.get()?.evaluateJavascript(js, null) }
    }

    /** Ouviu “Oi, Luna” e a tela está com a voz em tempo real (OpenAI): a conversa segue na tela */
    fun wakeWord() {
        main.post { view?.get()?.evaluateJavascript("window.dispatchEvent(new CustomEvent('dia-native-wakeword'))", null) }
    }

    /** state: listening | processing | speaking | idle | error */
    fun voice(state: String, heard: String = "", reply: String = "") {
        val detail = JSONObject().put("state", state).put("heard", heard).put("reply", reply).toString()
        main.post {
            view?.get()?.evaluateJavascript("window.dispatchEvent(new CustomEvent('dia-native-voice',{detail:$detail}))", null)
        }
    }
}
