package br.dia.app

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context

/**
 * Permissão de “administrador do aparelho” só para apagar a tela (bloquear agora). O Android não
 * deixa um app desligar a tela de outro jeito. O usuário libera uma vez e pode tirar quando quiser.
 */
class ScreenAdmin : DeviceAdminReceiver() {
    companion object {
        fun component(ctx: Context) = ComponentName(ctx, ScreenAdmin::class.java)
        fun active(ctx: Context) = ctx.getSystemService(DevicePolicyManager::class.java).isAdminActive(component(ctx))
    }
}
