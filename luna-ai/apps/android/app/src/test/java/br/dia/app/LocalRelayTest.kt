package br.dia.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

class LocalRelayTest {
    @Test
    fun repassaPedidoERespostaParaOServidorDaCasa() {
        // “Servidor da Luna” de mentira: responde com o que recebeu
        val luna = ServerSocket(0, 5, InetAddress.getLoopbackAddress())
        thread(isDaemon = true) {
            while (true) {
                val c = luna.accept()
                thread(isDaemon = true) {
                    val head = c.getInputStream().bufferedReader().readLine() ?: ""
                    val body = "ok:$head"
                    c.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n$body".toByteArray())
                    c.close()
                }
            }
        }
        assertFalse(LocalRelay.start("https://luna.exemplo.com"))
        assertTrue(LocalRelay.start("http://127.0.0.1:${luna.localPort}"))
        // dois pedidos seguidos (a ponte aceita várias conexões)
        repeat(2) { i ->
            Socket("127.0.0.1", LocalRelay.PORT).use { s ->
                s.getOutputStream().write("GET /api/health$i HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n".toByteArray())
                val resp = s.getInputStream().readBytes().decodeToString()
                assertTrue(resp, resp.startsWith("HTTP/1.1 200 OK"))
                assertEquals("ok:GET /api/health$i HTTP/1.1", resp.substringAfter("\r\n\r\n"))
            }
        }
        // a ponte só escuta no próprio aparelho
        assertTrue(InetAddress.getByName("127.0.0.1").isLoopbackAddress)
    }
}
