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
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager

/**
 * Tela apagada: vigia pela câmera da frente se alguém chegou perto e, se chegou, acende a tela e
 * abre a Luna. Só compara imagens minúsculas, duas vezes por segundo; nada é gravado nem enviado.
 * Roda só enquanto a tela está apagada pela Luna (a tela da Luna devolve a câmera para cá antes).
 */
class PresenceService : Service() {
    companion object {
        private const val CHANNEL = "presenca"
        private const val NOTIF_ID = 8
        @Volatile var running = false
            private set

        fun start(ctx: Context) {
            try { ctx.startForegroundService(Intent(ctx, PresenceService::class.java)) } catch (_: Exception) {}
        }

        fun stop(ctx: Context) {
            if (running) ctx.stopService(Intent(ctx, PresenceService::class.java))
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
    private var startedAt = 0L
    private var woke = false
    private var tries = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Tela apagada (acende quando alguém chega)", NotificationManager.IMPORTANCE_MIN))
        val n = Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_dia).setContentTitle("Luna").setContentText("Tela apagada: acende quando alguém chegar perto").setOngoing(true).build()
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA) else startForeground(NOTIF_ID, n)
        } catch (_: Exception) {
            stopSelf()
            return
        }
        thread = HandlerThread("luna-presenca").also { it.start() }
        handler = Handler(thread!!.looper)
        startedAt = System.currentTimeMillis()
        openCamera()
    }

    @SuppressLint("MissingPermission")
    private fun openCamera() {
        val cm = getSystemService(CameraManager::class.java)
        val id = try {
            cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT } ?: cm.cameraIdList.firstOrNull()
        } catch (_: Exception) { null } ?: return stopSelf()
        val r = ImageReader.newInstance(320, 240, ImageFormat.YUV_420_888, 2)
        reader = r
        r.setOnImageAvailableListener({ ir ->
            val img = try { ir.acquireLatestImage() } catch (_: Exception) { null } ?: return@setOnImageAvailableListener
            try {
                val now = System.currentTimeMillis()
                if (now - lastFrame < 500 || woke) return@setOnImageAvailableListener
                lastFrame = now
                val p = img.planes[0]
                val cur = Motion.downsample(p.buffer, img.width, img.height, p.rowStride, p.pixelStride)
                val before = prev
                prev = cur
                // Primeiros segundos: a câmera ainda está ajustando a exposição
                if (before == null || now - startedAt < 3000) return@setOnImageAvailableListener
                hits = if (Motion.changedFraction(before, cur) > Motion.SEEN) hits + 1 else 0
                if (hits >= 2) wake()
            } finally {
                img.close()
            }
        }, handler)
        try {
            cm.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(c: CameraDevice) {
                    camera = c
                    @Suppress("DEPRECATION")
                    c.createCaptureSession(listOf(r.surface), object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(s: CameraCaptureSession) {
                            session = s
                            try {
                                val req = c.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(r.surface) }
                                s.setRepeatingRequest(req.build(), null, handler)
                            } catch (_: Exception) { stopSelf() }
                        }
                        override fun onConfigureFailed(s: CameraCaptureSession) { stopSelf() }
                    }, handler)
                }
                override fun onDisconnected(c: CameraDevice) { c.close(); camera = null }
                override fun onError(c: CameraDevice, error: Int) { c.close(); camera = null; retry() }
            }, handler)
        } catch (_: Exception) {
            retry()
        }
    }

    /** A câmera ainda estava com a tela da Luna: tenta de novo algumas vezes */
    private fun retry() {
        reader?.close()
        reader = null
        if (++tries > 6) return stopSelf()
        handler?.postDelayed({ openCamera() }, 1000)
    }

    /** Alguém chegou: acende a tela e traz a Luna para a frente */
    private fun wake() {
        woke = true
        @Suppress("DEPRECATION")
        val wl = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "luna:presenca")
        try { wl.acquire(5000) } catch (_: Exception) {}
        try {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT).putExtra("presence", true))
        } catch (_: Exception) {}
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        try { session?.close() } catch (_: Exception) {}
        try { camera?.close() } catch (_: Exception) {}
        reader?.close()
        thread?.quitSafely()
        super.onDestroy()
    }
}
