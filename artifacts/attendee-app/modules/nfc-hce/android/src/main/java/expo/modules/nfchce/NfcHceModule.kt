package expo.modules.nfchce

import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NfcHceModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("NfcHce")

        AsyncFunction("setToken") { token: String ->
            TicketApduService.setToken(token)
        }

        AsyncFunction("clearToken") {
            TicketApduService.setToken(null)
        }

        AsyncFunction("isSupported") {
            val ctx = appContext.reactContext?.applicationContext ?: return@AsyncFunction false
            ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        }
    }
}
