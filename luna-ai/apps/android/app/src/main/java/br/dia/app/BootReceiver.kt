package br.dia.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

/**
 * Tablet ligou (ou o app foi atualizado): abre a Luna sozinha. O Android só deixa abrir uma tela
 * a partir daqui com “Aparecer sobre outros apps” permitido; sem isso, mostra um aviso para tocar.
 * A escuta do chamado “Oi, Luna” liga quando a tela da Luna abre.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val prefs = Prefs(ctx)
        if (prefs.url.isBlank() || (!prefs.autostart && !prefs.wake)) return
        val open = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (prefs.autostart && Settings.canDrawOverlays(ctx)) {
            try { ctx.startActivity(open); return } catch (_: Exception) {}
        }
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("inicio", "Abrir a Luna", NotificationManager.IMPORTANCE_DEFAULT))
        nm.notify(
            8,
            Notification.Builder(ctx, "inicio")
                .setSmallIcon(R.drawable.ic_stat_dia)
                .setContentTitle("Luna")
                .setContentText("Toque para abrir a Luna e ligar o chamado “Oi, Luna”.")
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(ctx, 3, open, PendingIntent.FLAG_IMMUTABLE))
                .build(),
        )
    }
}
