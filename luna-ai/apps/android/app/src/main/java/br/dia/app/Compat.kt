package br.dia.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Compatibilidade com Android 7.1 (Fire TV Stick com Fire OS 6): canais de notificação, serviço em
 * primeiro plano e permissão de instalar só existem a partir do Android 8. No 7 usa o equivalente antigo.
 */
object Compat {
    fun channel(ctx: Context, id: String, name: String, importance: Int) {
        if (Build.VERSION.SDK_INT >= 26) ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(id, name, importance))
    }

    @Suppress("DEPRECATION")
    fun builder(ctx: Context, channel: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, channel) else Notification.Builder(ctx)

    fun startForegroundService(ctx: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
    }

    /** No Android 7 a permissão é a opção geral “fontes desconhecidas”: o instalador do sistema pergunta */
    fun canInstallPackages(ctx: Context): Boolean = if (Build.VERSION.SDK_INT >= 26) ctx.packageManager.canRequestPackageInstalls() else true
}
