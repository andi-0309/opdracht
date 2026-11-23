package eu.zerver.opdracht

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class UpdateFileProvider : FileProvider()

class MainActivity : FlutterActivity() {
    private var resumed = false
    private var receiverRegistered = false
    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            updateKeepAwake(intent)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "eu.zerver.opdracht/installer")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "cacheDirectory" -> result.success(cacheDir.absolutePath)
                    "open" -> {
                        try {
                            result.success(openInstaller(File(call.arguments as String)))
                        } catch (exception: Exception) {
                            result.error("installer_unavailable", exception.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun openInstaller(file: File): Boolean {
        val uri = FileProvider.getUriForFile(this, "$packageName.updates", file)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            startActivity(Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.fromParts("package", packageName, null)
            ))
            return false
        }

        startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
        return true
    }

    private fun updateKeepAwake(intent: Intent?) {
        val plugged = intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        if (resumed && plugged != 0) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val battery = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(batteryReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(batteryReceiver, filter)
        }
        receiverRegistered = true
        updateKeepAwake(battery)
    }

    override fun onPause() {
        resumed = false
        if (receiverRegistered) {
            unregisterReceiver(batteryReceiver)
            receiverRegistered = false
        }
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onPause()
    }
}
