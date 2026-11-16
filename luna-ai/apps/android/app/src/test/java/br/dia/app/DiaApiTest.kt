package br.dia.app

import org.junit.Assert.assertEquals
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class DiaApiTest {
    @Test
    fun wavDoPedidoTemCabecalhoCerto() {
        val wav = DiaApi.wav16k(shortArrayOf(0, 1000, -1000))
        val b = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals("RIFF", String(wav, 0, 4))
        assertEquals("WAVE", String(wav, 8, 4))
        assertEquals(16000, b.getInt(24)) // taxa
        assertEquals(6, b.getInt(40)) // bytes de áudio
        assertEquals(1000.toShort(), b.getShort(46))
        assertEquals(50, wav.size)
    }
}
