package expo.modules.barcodereceiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BarcodeReceiverModule : Module() {
  private var broadcastReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("BarcodeReceiver")

    // CRITICAL: Must use Expo's sendEvent() + Events() declaration.
    // nativeModule.addListener() in src/index.ts only connects to the Expo
    // events channel — DeviceEventManagerModule/RCTDeviceEventEmitter will
    // NOT reach the JS listener. Do not revert to emitBarcode() or
    // RCTDeviceEventEmitter (regression introduced in commit 16af252).
    Events("onBarcodeScanned")

    OnCreate {
      registerReceiver()
    }

    AsyncFunction("startListening") { }

    AsyncFunction("stopListening") { }

    AsyncFunction("sendTestScan") { barcode: String ->
      sendEvent("onBarcodeScanned", mapOf("data" to barcode))
    }

    OnDestroy {
      unregisterReceiver()
    }
  }

  private fun registerReceiver() {
    if (broadcastReceiver != null) return
    val ctx = appContext.reactContext?.applicationContext ?: return

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val barcode = intent.getStringExtra("barcodeData") ?: return
        sendEvent("onBarcodeScanned", mapOf("data" to barcode))
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
