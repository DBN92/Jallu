package br.dia.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.concurrent.thread

/** Diagnóstico do app: o que aconteceu (em ordem), enviado ao servidor (data/diag.log) */
object AppDiag {
    private val queue = ConcurrentLinkedQueue<Pair<Long, String>>()
    @Volatile private var sending = false
    @Volatile private var prefs: Prefs? = null

    fun init(p: Prefs) { prefs = p }

    fun log(msg: String) {
        queue.add(System.currentTimeMillis() to msg.take(400))
        while (queue.size > 300) queue.poll()
        flushSoon()
    }

    private fun flushSoon() {
        if (sending) return
        sending = true
        thread(name = "luna-diag", isDaemon = true) {
            try { Thread.sleep(2500) } catch (_: InterruptedException) {}
            val p = prefs
            val events = JSONArray()
            while (events.length() < 100) { val e = queue.poll() ?: break; events.put(JSONObject().put("t", e.first).put("msg", e.second)) }
            if (p != null && p.url.isNotBlank() && p.token.isNotBlank() && events.length() > 0) {
                try {
                    val c = URL("${p.url}/api/diag").openConnection() as HttpURLConnection
                    c.requestMethod = "POST"; c.connectTimeout = 5000; c.readTimeout = 5000; c.doOutput = true
                    c.setRequestProperty("Authorization", "Bearer ${p.token}")
                    c.setRequestProperty("Content-Type", "application/json")
                    c.outputStream.use { it.write(JSONObject().put("source", "app").put("device", "${android.os.Build.MODEL} v${BuildConfig.VERSION_NAME}").put("events", events).toString().toByteArray()) }
                    c.responseCode; c.disconnect()
                } catch (_: Exception) {}
            }
            sending = false
            if (queue.isNotEmpty()) flushSoon()
        }
    }
}
