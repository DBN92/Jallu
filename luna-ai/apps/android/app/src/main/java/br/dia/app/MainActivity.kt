package br.dia.app

import java.util.Locale
import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Tela do app: a própria Luna (as mesmas telas do servidor, que se atualizam sozinhas) dentro de
 * um WebView, mais a ponte “DiaAndroid” para a tela ligar a escuta do chamado “Oi, Luna” no tablet.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private var web: WebView? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    @Volatile private var currentUrl: String = ""
    /** Voz para avisos da Luna (ex.: “A roupa está pronta”); criada só quando o primeiro aviso chega */
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeech: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        requestRuntimePermissions()
        if (prefs.url.isBlank()) showSetup() else showWeb()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        applyKeepOn()
        // App em primeiro plano: o Android permite (re)ligar o microfone em segundo plano a partir daqui
        if (prefs.wake && hasMic()) ListenService.send(this, ListenService.ACTION_START)
    }

    /** Botão “Falar com a Luna” (cortina), assistente do sistema ou atalho: ouve um pedido agora. */
    private fun handleIntent(i: Intent?) {
        if (i?.action == Intent.ACTION_ASSIST || i?.getBooleanExtra("listen", false) == true) {
            if (hasMic()) ListenService.send(this, ListenService.ACTION_LISTEN_NOW)
        }
    }

    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun requestRuntimePermissions() {
        val want = mutableListOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
        if (Build.VERSION.SDK_INT >= 33) want += Manifest.permission.POST_NOTIFICATIONS
        val missing = want.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        pendingPermission?.let { req ->
            val ok = req.resources.filter {
                (it == PermissionRequest.RESOURCE_AUDIO_CAPTURE && hasMic()) ||
                    (it == PermissionRequest.RESOURCE_VIDEO_CAPTURE && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            }
            if (ok.isNotEmpty()) req.grant(ok.toTypedArray()) else req.deny()
            pendingPermission = null
        }
        if (prefs.wake && hasMic()) ListenService.send(this, ListenService.ACTION_START)
    }

    private fun applyKeepOn() {
        if (prefs.keepOn) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    // ---------------- Primeira vez: endereço da Luna ----------------

    private fun showSetup(error: String? = null) {
        web?.destroy()
        web = null
        WebEvents.attach(null)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.parseColor("#06070D"))
        }
        box.addView(TextView(this).apply {
            text = "Luna"
            textSize = 34f
            setTextColor(Color.parseColor("#22D3EE"))
            gravity = Gravity.CENTER
        })
        box.addView(TextView(this).apply {
            text = "Endereço da Luna na sua casa (o mesmo que você abre no navegador):"
            textSize = 16f
            setTextColor(Color.WHITE)
            setPadding(0, pad, 0, pad / 3)
        })
        val input = EditText(this).apply {
            hint = "http://192.168.15.6:8787"
            setText(prefs.url.ifBlank { "http://" })
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            isSingleLine = true
        }
        box.addView(input)
        val msg = TextView(this).apply {
            text = error ?: ""
            setTextColor(Color.parseColor("#FB7185"))
            setPadding(0, pad / 3, 0, pad / 3)
        }
        box.addView(msg)
        box.addView(Button(this).apply {
            text = "Conectar"
            setOnClickListener {
                val url = input.text.toString().trim().trimEnd('/')
                msg.setTextColor(Color.WHITE)
                msg.text = "Testando…"
                thread {
                    val ok = try {
                        val c = URL("$url/api/health").openConnection() as HttpURLConnection
                        c.connectTimeout = 5000
                        c.readTimeout = 5000
                        (c.responseCode == 200).also { c.disconnect() }
                    } catch (_: Exception) { false }
                    runOnUiThread {
                        if (ok) { prefs.url = url; showWeb() }
                        else { msg.setTextColor(Color.parseColor("#FB7185")); msg.text = "Não encontrei a Luna nesse endereço. Confira o IP e a porta." }
                    }
                }
            }
        })
        // Rolável: com o tablet deitado e o teclado aberto, nada fica escondido
        setContentView(android.widget.ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.parseColor("#06070D"))
            addView(box)
        })
    }

    // ---------------- A Luna no WebView ----------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun showWeb() {
        val w = WebView(this)
        web = w
        WebEvents.attach(w)
        CookieManager.getInstance().setAcceptCookie(true)
        w.setBackgroundColor(Color.parseColor("#06070D"))
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            databaseEnabled = true
            setSupportZoom(false)
            userAgentString = "$userAgentString DiaAndroid/${BuildConfig.VERSION_NAME}"
        }
        w.addJavascriptInterface(Bridge(), "DiaAndroid")
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                // Só a Luna abre aqui dentro; links de fora vão para o navegador
                if (sameOrigin(req.url.toString())) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, req.url)) } catch (_: Exception) {}
                return true
            }
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) { currentUrl = url }
            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: android.webkit.WebResourceError) {
                if (req.isForMainFrame) view.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null)
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (!sameOrigin(request.origin.toString())) return@runOnUiThread request.deny()
                    val needMic = PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources && !hasMic()
                    val needCam = PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
                    if (needMic || needCam) { pendingPermission = request; requestRuntimePermissions() }
                    else request.grant(request.resources)
                }
            }
            // Escolher foto (ex.: foto do robô aspirador)
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                return try { startActivityForResult(params.createIntent(), 2); true } catch (_: Exception) { fileCallback = null; false }
            }
        }
        w.loadUrl(prefs.url)
        setContentView(w)
        applyKeepOn()
    }

    @Deprecated("API do Android")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 2) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        }
    }

    private fun offlinePage() = """<html><body style="background:#06070d;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
        <h2 style="color:#22d3ee">Sem conexão com a Luna</h2><p>Confira se o servidor está ligado e o tablet no Wi-Fi de casa.</p>
        <p><button style="font-size:18px;padding:12px 24px;border-radius:24px;border:0" onclick="location.href='${prefs.url}'">Tentar de novo</button></p>
        <p><button style="font-size:14px;padding:8px 16px;border-radius:16px;border:0;opacity:.7" onclick="DiaAndroid.changeServer()">Trocar endereço</button></p></body></html>"""

    private fun sameOrigin(url: String): Boolean {
        val a = Uri.parse(url)
        val b = Uri.parse(prefs.url)
        return a.scheme == b.scheme && a.host == b.host && a.port == b.port
    }

    @Deprecated("API do Android")
    override fun onBackPressed() {
        val w = web
        if (w != null && w.canGoBack()) w.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }

    private fun speakNotice(text: String) {
        val t = tts
        if (t != null && ttsReady) {
            t.speak(text, TextToSpeech.QUEUE_ADD, null, "aviso")
            return
        }
        pendingSpeech = text
        if (t != null) return
        tts = TextToSpeech(this) { st ->
            if (st == TextToSpeech.SUCCESS) {
                tts?.language = Locale("pt", "BR")
                ttsReady = true
                pendingSpeech?.let { tts?.speak(it, TextToSpeech.QUEUE_ADD, null, "aviso") }
            }
            pendingSpeech = null
        }
    }

    override fun onDestroy() {
        tts?.shutdown()
        WebEvents.attach(null)
        web?.destroy()
        super.onDestroy()
    }

    /**
     * Ponte chamada pela tela da Luna (Configurações › App Android). Só responde quando a página
     * aberta é a própria Luna — nenhum outro site consegue usar estas funções.
     */
    inner class Bridge {
        private fun allowed() = currentUrl.isEmpty() || sameOrigin(currentUrl)

        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun versionCode(): Int = BuildConfig.VERSION_CODE

        @JavascriptInterface
        fun status(): String {
            if (!allowed()) return "{}"
            val pm = getSystemService(PowerManager::class.java)
            return JSONObject()
                .put("version", BuildConfig.VERSION_NAME)
                .put("versionCode", BuildConfig.VERSION_CODE)
                .put("wake", prefs.wake)
                .put("token", prefs.token.isNotBlank())
                .put("listening", ListenService.status)
                .put("modelReady", ModelManager.ready(this@MainActivity))
                .put("mic", hasMic())
                .put("autostart", prefs.autostart)
                .put("overlay", Settings.canDrawOverlays(this@MainActivity))
                .put("battery", pm.isIgnoringBatteryOptimizations(packageName))
                .put("keepOn", prefs.keepOn)
                .put("sensitivity", prefs.sensitivity)
                .toString()
        }

        @JavascriptInterface fun setToken(token: String) { if (allowed() && (token.startsWith("luna_") || token.startsWith("dia_"))) prefs.token = token }

        @JavascriptInterface
        fun setWake(on: Boolean) {
            if (!allowed()) return
            prefs.wake = on
            runOnUiThread {
                if (on) { requestRuntimePermissions(); if (hasMic()) ListenService.send(this@MainActivity, ListenService.ACTION_START) }
                else ListenService.send(this@MainActivity, ListenService.ACTION_STOP)
            }
        }

        @JavascriptInterface
        fun setSensitivity(s: String) {
            if (!allowed() || s !in listOf("alta", "normal", "baixa")) return
            prefs.sensitivity = s
            // Reinicia a escuta para valer o novo nível
            if (prefs.wake) runOnUiThread { ListenService.send(this@MainActivity, ListenService.ACTION_PAUSE); ListenService.send(this@MainActivity, ListenService.ACTION_RESUME) }
        }

        @JavascriptInterface fun setAutostart(on: Boolean) { if (allowed()) prefs.autostart = on }
        @JavascriptInterface fun setKeepOn(on: Boolean) { if (allowed()) { prefs.keepOn = on; runOnUiThread { applyKeepOn() } } }

        /** Botão de microfone da tela: ouve o pedido pelo app (o WebView não reconhece fala). */
        @JavascriptInterface fun listen() { if (allowed()) runOnUiThread { if (hasMic()) ListenService.send(this@MainActivity, ListenService.ACTION_LISTEN_NOW) else requestRuntimePermissions() } }

        @SuppressLint("BatteryLife")
        @JavascriptInterface
        fun openBattery() {
            if (!allowed()) return
            runOnUiThread {
                try { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
                catch (_: Exception) { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            }
        }

        /** “Aparecer sobre outros apps”: necessário para a Luna abrir sozinha quando o tablet liga. */
        @JavascriptInterface
        fun openOverlay() {
            if (allowed()) runOnUiThread { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) }
        }

        @JavascriptInterface fun openAppSettings() { if (allowed()) runOnUiThread { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } }

        @JavascriptInterface fun changeServer() { runOnUiThread { showSetup() } }

        /** Aviso falado (ex.: lava e seca terminou). Texto curto, só da própria Luna. */
        @JavascriptInterface
        fun speak(text: String) {
            if (!allowed() || text.isBlank()) return
            val t = text.take(200)
            runOnUiThread { speakNotice(t) }
        }

        /**
         * Atualização: baixa o APK novo pela própria Luna (com o login do app) para a pasta Downloads.
         * Ao terminar, tocar no aviso abre o instalador do Android, que pede confirmação.
         */
        @JavascriptInterface
        fun update() {
            if (!allowed()) return
            runOnUiThread {
                val url = "${prefs.url}/api/android/apk"
                val req = android.app.DownloadManager.Request(Uri.parse(url))
                    .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                    .setMimeType("application/vnd.android.package-archive")
                    .setTitle("Luna — atualização")
                    .setDescription("Toque para instalar a nova versão")
                    .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, "Luna-${System.currentTimeMillis()}.apk")
                getSystemService(android.app.DownloadManager::class.java).enqueue(req)
            }
        }
    }
}
