package br.dia.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Atalhos de aplicativos na TV (YouTube, Prime Video, Netflix, Claro tv+…): lista os apps instalados que
 * aparecem na tela inicial (TV ou celular) e abre o escolhido. Só lista e abre — não mexe em nenhum app.
 */
object AppLauncher {
    private fun image(d: Drawable?, w: Int, h: Int): String? {
        if (d == null) return null
        return try {
            val bmp = if (d is BitmapDrawable && d.bitmap != null) Bitmap.createScaledBitmap(d.bitmap, w, h, true)
            else Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { val c = Canvas(it); d.setBounds(0, 0, w, h); d.draw(c) }
            val out = ByteArrayOutputStream()
            @Suppress("DEPRECATION")
            val fmt = if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
            bmp.compress(fmt, 82, out)
            "data:image/webp;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (_: Exception) { null }
    }

    /** [{pkg, label, icon, banner}] em ordem alfabética (banner = faixa 16:9 que os apps de TV têm) */
    fun list(ctx: Context): String {
        val pm = ctx.packageManager
        val seen = linkedMapOf<String, JSONObject>()
        for (cat in listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)) {
            val q = Intent(Intent.ACTION_MAIN).addCategory(cat)
            @Suppress("DEPRECATION")
            for (ri in pm.queryIntentActivities(q, 0)) {
                val pkg = ri.activityInfo.packageName
                if (pkg == ctx.packageName || seen.containsKey(pkg)) continue
                val app = ri.activityInfo.applicationInfo
                val banner = try { pm.getApplicationBanner(app) ?: ri.activityInfo.loadBanner(pm) } catch (_: Exception) { null }
                seen[pkg] = JSONObject()
                    .put("pkg", pkg)
                    .put("label", ri.loadLabel(pm).toString())
                    .put("icon", image(ri.loadIcon(pm), 96, 96))
                    .put("banner", image(banner, 240, 135))
            }
        }
        val arr = JSONArray()
        seen.values.sortedBy { it.optString("label").lowercase() }.forEach { arr.put(it) }
        return arr.toString()
    }

    /** Abre o app (versão de TV se houver). false = não instalado ou sem tela de abertura. */
    fun launch(ctx: Context, pkg: String): Boolean {
        val pm = ctx.packageManager
        val i = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
        return try {
            ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED))
            true
        } catch (_: Exception) { false }
    }
}
