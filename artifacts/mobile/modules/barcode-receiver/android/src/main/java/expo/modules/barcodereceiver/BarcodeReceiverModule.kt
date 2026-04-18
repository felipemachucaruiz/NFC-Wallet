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

    // Auto-register on module load so the receiver is always active,
    // regardless of which screen is currently mounted.
    OnCreate {
      registerReceiver()
    }

    // Kept for API compatibility — receiver is already registered in OnCreate.
    AsyncFunction("startListening") { }

    AsyncFunction("stopListening") { }

    // Fires the event directly without a broadcast — use to verify the JS event chain.
    AsyncFunction("sendTestScan") { barcode: String ->
      sendEvent("onBarcodeScanned", mapOf("data" to barcode))
    }

    OnDestroy {
      unregisterReceiver()
    }
  }

  private fun registerReceiver() {
    if (broadcastReceiver != null) return

    // Get context first — if unavailable, bail without touching broadcastReceiver.
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
