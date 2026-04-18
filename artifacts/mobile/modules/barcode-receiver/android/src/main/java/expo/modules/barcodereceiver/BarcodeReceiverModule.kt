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

    Events("onBarcodeScanned")

    AsyncFunction("startListening") {
      registerReceiver()
    }

    AsyncFunction("stopListening") {
      unregisterReceiver()
    }

    OnDestroy {
      unregisterReceiver()
    }
  }

  private fun registerReceiver() {
    if (broadcastReceiver != null) return

    broadcastReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val barcode = intent.getStringExtra("barcodeData") ?: return
        sendEvent("onBarcodeScanned", mapOf("data" to barcode))
      }
    }

    val filter = IntentFilter("scan.rcv.message")
    try {
      appContext.reactContext?.registerReceiver(broadcastReceiver, filter)
    } catch (e: Exception) {
      broadcastReceiver = null
    }
  }

  private fun unregisterReceiver() {
    broadcastReceiver?.let { receiver ->
      try {
        appContext.reactContext?.unregisterReceiver(receiver)
      } catch (_: Exception) {}
      broadcastReceiver = null
    }
  }
}
