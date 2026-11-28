package br.dia.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer

class MotionTest {
    private fun plane(w: Int, h: Int, v: (Int, Int) -> Int): ByteBuffer {
        val b = ByteBuffer.allocate(w * h)
        for (y in 0 until h) for (x in 0 until w) b.put(y * w + x, v(x, y).toByte())
        return b
    }

    @Test
    fun alguem_chegando_na_penumbra_conta_e_exposicao_nao() {
        val dark = Motion.downsample(plane(320, 240) { _, _ -> 18 }, 320, 240, 320)
        val person = Motion.downsample(plane(320, 240) { x, y -> if (x < 160 && y < 120) 5 else 18 }, 320, 240, 320)
        assertTrue(Motion.changedFraction(dark, person) > 0.2f)
        // a câmera clareou tudo junto (exposição automática): não é movimento
        val brighter = Motion.downsample(plane(320, 240) { _, _ -> 45 }, 320, 240, 320)
        assertEquals(0f, Motion.changedFraction(dark, brighter), 0f)
        // ruído leve da câmera não conta
        val noisy = Motion.downsample(plane(320, 240) { x, y -> 18 + ((x + y) % 5) - 2 }, 320, 240, 320)
        assertTrue(Motion.changedFraction(dark, noisy) < Motion.SEEN)
    }
}
