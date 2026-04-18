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

    // Fires the event directly without a broadcast — used to verify the JS event chain works.
    AsyncFunction("sendTestScan") { barcode: String ->
      sendEvent("onBarcodeScanned", mapOf("data" to barcode))
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
    // Use applicationContext for stability — survives React Native reloads.
    val ctx = appContext.reactContext?.applicationContext ?: return
    try {
      if (android.os.Build.VERSION.SDK_INT >= 33) {
        ctx.registerReceiver(broadcastReceiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        ctx.registerReceiver(broadcastReceiver, filter)
      }
    } catch (e: Exception) {
      broadcastReceiver = null
    }
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
