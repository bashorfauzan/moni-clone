package com.moni.notifier.service

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

class WhatsAppNotificationListenerService : NotificationListenerService() {
    private lateinit var preferenceStore: PreferenceStore
    private lateinit var webhookSender: WebhookSender

    override fun onCreate() {
        super.onCreate()
        preferenceStore = PreferenceStore(this)
        webhookSender = WebhookSender(preferenceStore)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val packageName = sbn.packageName ?: return
        val isSupported = SUPPORTED_PACKAGES.contains(packageName) || 
                          packageName.contains("bank", ignoreCase = true) ||
                          packageName.contains("bca", ignoreCase = true) ||
                          packageName.contains("livin", ignoreCase = true) ||
                          packageName.contains("bri", ignoreCase = true) ||
                          packageName.contains("bni", ignoreCase = true) ||
                          packageName.contains("jago", ignoreCase = true) ||
                          packageName.contains("dana", ignoreCase = true) ||
                          packageName.contains("ovo", ignoreCase = true) ||
                          packageName.contains("gojek", ignoreCase = true) ||
                          packageName.contains("shopee", ignoreCase = true)
        if (!isSupported) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        val bigText = extras.getCharSequence("android.bigText")?.toString().orEmpty()
        val senderName = extras.getCharSequence("android.subText")?.toString().orEmpty()

        val messageText = when {
            bigText.isNotBlank() -> bigText
            text.isNotBlank() -> text
            else -> return
        }

        val fullText = listOf(title, senderName, messageText)
            .joinToString(" ")
            .lowercase()
        val filters = preferenceStore.getFilterKeywords()
            .split(",")
            .map { it.trim().lowercase() }
            .filter { it.isNotBlank() }

        if (filters.isNotEmpty() && filters.none { keyword -> fullText.contains(keyword) }) {
            preferenceStore.setLastDeliveryStatus(
                "Diabaikan ${java.time.Instant.ofEpochMilli(sbn.postTime)} • tidak cocok filter"
            )
            return
        }

        val appNameStr = when {
            packageName.contains("whatsapp", ignoreCase = true) -> "WhatsApp"
            packageName.contains("bca", ignoreCase = true) -> "BCA"
            packageName.contains("mandiri", ignoreCase = true) || packageName.contains("livin", ignoreCase = true) -> "Mandiri"
            packageName.contains("brimo", ignoreCase = true) || packageName.contains("bri", ignoreCase = true) -> "BRI"
            packageName.contains("bni", ignoreCase = true) -> "BNI"
            packageName.contains("jago", ignoreCase = true) -> "Jago"
            packageName.contains("seabank", ignoreCase = true) -> "SeaBank"
            packageName.contains("jenius", ignoreCase = true) || packageName.contains("btpn", ignoreCase = true) -> "Jenius"
            packageName.contains("dana", ignoreCase = true) -> "DANA"
            packageName.contains("ovo", ignoreCase = true) -> "OVO"
            packageName.contains("gojek", ignoreCase = true) -> "GoPay"
            packageName.contains("shopee", ignoreCase = true) -> "ShopeePay"
            else -> packageName
        }

        val payload = JSONObject().apply {
            put("appName", appNameStr)
            put("title", title)
            put("senderName", senderName)
            put("text", messageText)
            put("receivedAt", java.time.Instant.ofEpochMilli(sbn.postTime).toString())
            put(
                "rawPayload",
                JSONObject().apply {
                    put("packageName", packageName)
                    put("notificationKey", sbn.key)
                    put("postTime", sbn.postTime)
                    put("androidTitle", title)
                }
            )
        }

        webhookSender.send(payload)
    }

    companion object {
        private val SUPPORTED_PACKAGES = setOf(
            "com.whatsapp", "com.whatsapp.w4b",
            "com.bca", "com.bca.mybca", "com.bcadigital.blu",
            "id.co.bankmandiri.livin.android",
            "id.co.bri.brimo",
            "src.com.bni",
            "com.jago.transactionApp",
            "com.bke.seabank",
            "com.btpn.dc.madison",
            "com.gojek.app",
            "ovo.id",
            "id.dana",
            "com.telkom.mwallet",
            "com.shopee.id"
        )
    }
}
