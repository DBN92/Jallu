package br.dia.app

import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import kotlin.concurrent.thread

/**
 * Ponte local: o app abre a Luna por http://127.0.0.1:8788 e esta ponte só repassa os bytes para o
 * servidor da casa. Motivo: o Android só libera a câmera (gestos, presença, recados em vídeo) para
 * páginas “seguras”, e 127.0.0.1 conta como segura; o endereço http da rede de casa, não.
 * Só escuta no próprio tablet (loopback) e só fala com o endereço da Luna configurado.
 */
object LocalRelay {
    const val PORT = 8788
    const val ORIGIN = "http://127.0.0.1:$PORT"
    @Volatile private var server: ServerSocket? = null
    @Volatile private var target: String = ""

    /** Liga a ponte para este endereço (http). Devolve false se não deu (aí o app abre o endereço direto). */
    @Synchronized
    fun start(url: String): Boolean {
        if (!url.startsWith("http://")) return false
        target = url
        if (server != null) return true
        return try {
            val s = ServerSocket(PORT, 50, InetAddress.getLoopbackAddress())
            server = s
            thread(name = "luna-ponte", isDaemon = true) {
                while (!s.isClosed) {
                    val c = try { s.accept() } catch (_: Exception) { break }
                    thread(name = "luna-ponte-c", isDaemon = true) { serve(c) }
                }
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun serve(client: Socket) {
        val up = Socket()
        try {
            val u = URI(target)
            up.connect(InetSocketAddress(u.host, if (u.port > 0) u.port else 80), 6000)
            up.tcpNoDelay = true
            client.tcpNoDelay = true
            val back = thread(name = "luna-ponte-v", isDaemon = true) { pump(up.getInputStream(), client.getOutputStream()); close(client, up) }
            pump(client.getInputStream(), up.getOutputStream())
            close(client, up)
            back.join(1000)
        } catch (_: Exception) {
            close(client, up)
        }
    }

    private fun pump(i: InputStream, o: OutputStream) {
        val buf = ByteArray(16 * 1024)
        try {
            while (true) {
                val n = i.read(buf)
                if (n < 0) break
                o.write(buf, 0, n)
                o.flush()
            }
        } catch (_: Exception) {
        }
    }

    private fun close(a: Socket, b: Socket) {
        try { a.close() } catch (_: Exception) {}
        try { b.close() } catch (_: Exception) {}
    }
}
