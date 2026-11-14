package br.dia.app

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager

/**
 * Presença pela câmera da frente, feita pelo próprio app (a tela da Luna não abre a câmera para isso:
 * no navegador interno do Android isso deixava a tela preta). Compara imagens minúsculas duas vezes
 * por segundo; nada é gravado nem enviado. Avisa a tela a cada quadro (“dia-native-motion”) e, com a
 * tela apagada pela Luna, acende a tela quando alguém chega perto.
 */
class PresenceService : Service() {
    companion object {
        private const val CHANNEL = "presenca"
        private const val NOTIF_ID = 8
        @Volatile var running = false
            private set
        /** Tela apagada pela Luna: o próximo movimento acende a tela */
        @Volatile var sleepMode = false
        /** Câmera emprestada para a tela (recado em vídeo, gestos): a vigia fica parada */
        @Volatile var paused = false
            private set
        private var instance: PresenceService? = null

        fun start(ctx: Context) {
            if (running) return
            try { ctx.startForegroundService(Intent(ctx, PresenceService::class.java)) } catch (_: Exception) {}
        }

        fun stop(ctx: Context) {
            sleepMode = false
            if (running) ctx.stopService(Intent(ctx, PresenceService::class.java))
        }

        fun setPaused(on: Boolean) {
            paused = on
            instance?.let { s -> s.handler?.post { if (on) s.closeCamera() else if (s.camera == null) s.openCamera() } }
        }
    }

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var camera: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var prev: FloatArray? = null
    private var hits = 0
    private var lastFrame = 0L
    private var openedAt = 0L
    private var tries = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        instance = this
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Presença (acende a tela quando alguém chega)", NotificationManager.IMPORTANCE_MIN))
        val n = Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_dia).setContentTitle("Luna").setContentText("Percebe quando alguém chega perto da tela").setOngoing(true).build()
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA) else startForeground(NOTIF_ID, n)
        } catch (_: Exception) {
            stopSelf()
            return
        }
        thread = HandlerThread("luna-presenca").also { it.start() }
        handler = Handler(thread!!.looper)
        if (!paused) handler?.post { openCamera() }
    }

    @SuppressLint("MissingPermission")
    private fun openCamera() {
        if (paused || camera != null) return
        val cm = getSystemService(CameraManager::class.java)
        val id = try {
            cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT } ?: cm.cameraIdList.firstOrNull()
        } catch (_: Exception) { null } ?: return
        val r = ImageReader.newInstance(320, 240, ImageFormat.YUV_420_888, 2)
        reader = r
        prev = null
        hits = 0
        openedAt = System.currentTimeMillis()
        r.setOnImageAvailableListener({ ir ->
            val img = try { ir.acquireLatestImage() } catch (_: Exception) { null } ?: return@setOnImageAvailableListener
            try {
                val now = System.currentTimeMillis()
                if (now - lastFrame < 500) return@setOnImageAvailableListener
                lastFrame = now
                val p = img.planes[0]
                val cur = Motion.downsample(p.buffer, img.width, img.height, p.rowStride, p.pixelStride)
                val before = prev
                prev = cur
                // Primeiros segundos: a câmera ainda está ajustando a exposição
                if (before == null || now - openedAt < 3000) return@setOnImageAvailableListener
                val level = Motion.changedFraction(before, cur)
                WebEvents.motion(level, cur.average().toFloat())
                hits = if (level > Motion.SEEN) hits + 1 else 0
                if (sleepMode && hits >= 2) wake()
            } finally {
                img.close()
            }
        }, handler)
        try {
            cm.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(c: CameraDevice) {
                    if (paused) { c.close(); return }
                    camera = c
                    tries = 0
                    @Suppress("DEPRECATION")
                    c.createCaptureSession(listOf(r.surface), object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(s: CameraCaptureSession) {
                            session = s
                            try {
                                val req = c.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(r.surface) }
                                s.setRepeatingRequest(req.build(), null, handler)
                            } catch (_: Exception) { retry() }
                        }
                        override fun onConfigureFailed(s: CameraCaptureSession) { retry() }
                    }, handler)
                }
                override fun onDisconnected(c: CameraDevice) { c.close(); if (camera === c) camera = null; retry() }
                override fun onError(c: CameraDevice, error: Int) { c.close(); if (camera === c) camera = null; retry() }
            }, handler)
        } catch (_: Exception) {
            retry()
        }
    }

    private fun closeCamera() {
        try { session?.close() } catch (_: Exception) {}
        try { camera?.close() } catch (_: Exception) {}
        session = null
        camera = null
        reader?.close()
        reader = null
    }

    /** Câmera ocupada (outro app, ou a tela gravando um recado): tenta de novo daqui a pouco */
    private fun retry() {
        closeCamera()
        if (paused) return
        val wait = if (++tries > 6) 30_000L else 2_000L
        handler?.postDelayed({ openCamera() }, wait)
    }

    /** Alguém chegou com a tela apagada: acende a tela e traz a Luna para a frente */
    private fun wake() {
        sleepMode = false
        hits = 0
        @Suppress("DEPRECATION")
        val wl = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "luna:presenca")
        try { wl.acquire(5000) } catch (_: Exception) {}
        try {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT).putExtra("presence", true))
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        running = false
        instance = null
        handler?.post { closeCamera() }
        thread?.quitSafely()
        super.onDestroy()
    }
}
