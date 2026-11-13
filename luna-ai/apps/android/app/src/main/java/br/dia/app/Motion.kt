package br.dia.app

import java.nio.ByteBuffer
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Movimento na frente do tablet, comparando imagens minúsculas (32×24) em tons de cinza.
 * Mesma regra da tela da Luna: a diferença exigida acompanha a claridade da cena (funciona na
 * penumbra) e a mudança geral de exposição da câmera é descontada.
 */
object Motion {
    const val W = 32
    const val H = 24
    /** Fração da imagem que precisa mudar para contar como alguém chegando */
    const val SEEN = 0.015f

    /** Reduz o plano Y (brilho) da câmera para 32×24, tirando a média de cada bloco */
    fun downsample(y: ByteBuffer, width: Int, height: Int, rowStride: Int, pixelStride: Int = 1): FloatArray {
        val out = FloatArray(W * H)
        val bw = width / W
        val bh = height / H
        for (oy in 0 until H) for (ox in 0 until W) {
            var sum = 0L
            var n = 0
            var yy = oy * bh
            while (yy < (oy + 1) * bh) {
                var xx = ox * bw
                while (xx < (ox + 1) * bw) {
                    sum += y.get(yy * rowStride + xx * pixelStride).toInt() and 0xff
                    n++
                    xx += 2
                }
                yy += 2
            }
            out[oy * W + ox] = if (n > 0) sum.toFloat() / n else 0f
        }
        return out
    }

    fun changedFraction(a: FloatArray, b: FloatArray): Float {
        val ma = a.average().toFloat()
        val mb = b.average().toFloat()
        val limit = min(28f, max(6f, (ma + mb) / 2 * 0.3f))
        var n = 0
        for (k in a.indices) if (abs(a[k] - ma - (b[k] - mb)) > limit) n++
        return n.toFloat() / a.size
    }
}
