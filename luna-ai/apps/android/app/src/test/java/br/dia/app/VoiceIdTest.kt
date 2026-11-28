package br.dia.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceIdTest {
    private fun v(vararg x: Double) = doubleArrayOf(*x)

    @Test
    fun reconheceQuemEstaCadastradoERecusaVozEstranha() {
        val people = mapOf(
            "Daniel" to listOf(v(1.0, 0.1, 0.0), v(0.9, 0.2, 0.0), v(1.0, 0.0, 0.1)),
            "Natália" to listOf(v(0.0, 1.0, 0.1), v(0.1, 0.9, 0.0), v(0.0, 1.0, 0.0)),
        )
        val daniel = VoiceId.identify(v(0.95, 0.15, 0.05), people, "normal")
        assertEquals("Daniel", daniel.name)
        val natalia = VoiceId.identify(v(0.05, 0.95, 0.0), people, "normal")
        assertEquals("Natália", natalia.name)
        // voz “da TV”: longe das duas
        val tv = VoiceId.identify(v(0.0, 0.0, 1.0), people, "normal")
        assertNull(tv.name)
        assertEquals(true, tv.closest != null)
    }

    @Test
    fun rigorMudaOLimiteEPessoaComPoucasAmostrasNaoConta() {
        val people = mapOf("Daniel" to listOf(v(1.0, 0.0), v(1.0, 0.0), v(1.0, 0.0)), "Nova" to listOf(v(0.0, 1.0)))
        val meio = v(1.0, 1.0) // semelhança 0,707 com Daniel
        assertEquals("Daniel", VoiceId.identify(meio, people, "rigido").name)
        assertNull(VoiceId.identify(v(1.0, 2.2), people, "rigido").name) // ~0,41
        assertEquals("Daniel", VoiceId.identify(v(1.0, 2.2), people, "leve").name)
        // “Nova” tem 1 amostra só: não entra na comparação
        assertEquals(listOf<Pair<String, Double>>(), VoiceId.identify(v(0.0, 1.0), people, "leve").others)
    }

    @Test
    fun guardaELeAsAssinaturas() {
        val p = mapOf("Daniel" to listOf(v(0.12345, -0.5)), "Natália" to listOf(v(1.0, 2.0), v(3.0, 4.0)))
        val back = VoiceId.parse(VoiceId.serialize(p))
        assertEquals(setOf("Daniel", "Natália"), back.keys)
        assertEquals(0.1235, back["Daniel"]!![0][0], 0.0001)
        assertEquals(2, back["Natália"]!!.size)
        assertEquals(0, VoiceId.parse("lixo").size)
    }

    @Test
    fun assinaturaEDuracaoDoChamado() {
        assertEquals(listOf(0.5, -1.0), VoiceId.vector("""{"text":"oi luna","spk":[0.5,-1.0],"spk_frames":80}""")!!.toList())
        assertNull(VoiceId.vector("""{"text":""}"""))
        assertEquals(1.0 to 1.6, WakeMatch.span("""{"result":[{"word":"oi","start":1.0,"end":1.2,"conf":1},{"word":"luna","start":1.25,"end":1.6,"conf":1}]}"""))
        assertNull(WakeMatch.span("""{"result":[{"word":"luna","start":1.0,"end":1.2,"conf":1}]}"""))
    }
}
