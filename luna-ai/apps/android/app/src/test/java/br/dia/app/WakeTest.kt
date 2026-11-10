package br.dia.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeTest {
    @Test
    fun acha_oi_dia_com_confianca() {
        val json = """{"result":[{"conf":0.9,"word":"oi"},{"conf":0.7,"word":"dia"}],"text":"oi dia"}"""
        assertEquals(0.8f, WakeMatch.score(json), 0.001f)
    }

    @Test
    fun ignora_bom_dia_e_vazio() {
        assertEquals(0f, WakeMatch.score("""{"result":[{"conf":1.0,"word":"bom"},{"conf":1.0,"word":"dia"}],"text":"bom dia"}"""), 0f)
        assertEquals(0f, WakeMatch.score("""{"text":""}"""), 0f)
        assertEquals(0f, WakeMatch.score("""{"result":[{"conf":1.0,"word":"dia"},{"conf":1.0,"word":"oi"}]}"""), 0f)
    }

    @Test
    fun sensibilidade() {
        assertTrue(WakeMatch.threshold("alta") < WakeMatch.threshold("normal"))
        assertTrue(WakeMatch.threshold("baixa") > WakeMatch.threshold("normal"))
    }

    @Test
    fun ganho_sobe_fala_baixa_e_nao_estoura() {
        val agc = AutoGain()
        val quiet = ShortArray(16000) { (if (it % 2 == 0) 100 else -100).toShort() }
        agc.process(quiet, quiet.size)
        assertTrue("fala baixa ganha volume", kotlin.math.abs(quiet.last().toInt()) > 500)
        val loud = ShortArray(16000) { (if (it % 2 == 0) 30000 else -30000).toShort() }
        AutoGain().process(loud, loud.size)
        assertTrue("não passa do limite", loud.all { it in -32768..32767 })
        assertEquals("fala alta não é amplificada", 30000, loud.last().toInt().let { kotlin.math.abs(it) })
    }
}
