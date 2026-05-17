package expo.modules.nfchce

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

class TicketApduService : HostApduService() {

    companion object {
        // AID: F0 54 41 50 45 45 54 01  ("TAPEET" + version 01, F0 prefix = proprietary)
        val AID: ByteArray = byteArrayOf(
            0xF0.toByte(), 0x54, 0x41, 0x50, 0x45, 0x45, 0x54, 0x01
        )

        private val SW_OK       = byteArrayOf(0x90.toByte(), 0x00)
        private val SW_NO_DATA  = byteArrayOf(0x6A.toByte(), 0x88.toByte()) // Referenced data not found
        private val SW_UNKNOWN  = byteArrayOf(0x6D.toByte(), 0x00)          // INS not supported

        @Volatile private var activeToken: String? = null

        fun setToken(token: String?) { activeToken = token }
        fun getToken(): String? = activeToken
    }

    private var selected = false

    override fun processCommandApdu(apdu: ByteArray, extras: Bundle?): ByteArray {
        if (apdu.size < 4) return SW_UNKNOWN

        val cla = apdu[0]
        val ins = apdu[1]

        // SELECT FILE by AID: 00 A4 04 00 [Lc] [AID...]
        if (cla == 0x00.toByte() && ins == 0xA4.toByte()) {
            val p1 = apdu[2]
            if (p1 == 0x04.toByte() && apdu.size >= 5) {
                val lc = apdu[4].toInt() and 0xFF
                if (apdu.size >= 5 + lc) {
                    val aid = apdu.copyOfRange(5, 5 + lc)
                    if (aid.contentEquals(AID)) {
                        selected = true
                        return SW_OK
                    }
                }
            }
            selected = false
            return SW_UNKNOWN
        }

        if (!selected) return SW_UNKNOWN

        // GET DATA: 00 CA 00 00 [Le]
        if (cla == 0x00.toByte() && ins == 0xCA.toByte()) {
            val token = activeToken ?: return SW_NO_DATA
            val tokenBytes = token.toByteArray(Charsets.UTF_8)
            return tokenBytes + SW_OK
        }

        return SW_UNKNOWN
    }

    override fun onDeactivated(reason: Int) {
        selected = false
    }
}
