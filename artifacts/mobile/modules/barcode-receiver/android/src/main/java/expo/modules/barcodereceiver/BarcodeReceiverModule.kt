package expo.modules.barcodereceiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BarcodeReceiverModule : Module() {
  private var broadcastReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("BarcodeReceiver")

    OnCreate {
      registerReceiver()
    }

    AsyncFunction("startListening") { }

    AsyncFunction("stopListening") { }

    AsyncFunction("sendTestScan") { barcode: String ->
      emitBarcode(barcode)
    }

    OnDestroy {
      unregisterReceiver()
    }
  }

  private fun emitBarcode(barcode: String) {
    val reactContext = appContext.reactContext as? ReactContext ?: return
    val params = Arguments.createMap().apply { putString("data", barcode) }
    Handler(Looper.getMainLooper()).post {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("BarcodeReceiverEvent", params)
    }
  }

  private fun registerReceiver() {
    if (broadcastReceiver != null) return
    val ctx = appContext.reactContext?.applicationContext ?: return

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val barcode = intent.getStringExtra("barcodeData") ?: return
        emitBarcode(barcode)
      }
    }

    val filter = IntentFilter("scan.rcv.message")
    try {
      if (android.os.Build.VERSION.SDK_INT >= 33) {
        ctx.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        ctx.registerReceiver(receiver, filter)
      }
      broadcastReceiver = receiver
    } catch (_: Exception) { }
  }

  private fun unregisterReceiver() {
    broadcastReceiver?.let { receiver ->
      try {
        appContext.reactContext?.applicationContext?.unregisterReceiver(receiver)
      } catch (_: Exception) {}
      broadcastReceiver = null
    }
  }
}
