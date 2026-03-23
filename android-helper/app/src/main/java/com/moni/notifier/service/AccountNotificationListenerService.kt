package com.moni.notifier.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

class AccountNotificationListenerService : NotificationListenerService() {
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
        val title = firstNonBlank(
            extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            extras.getCharSequence("android.title.big")?.toString()
        )
        val text = firstNonBlank(
            extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString(),
            joinTextLines(extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES))
        )
        val senderName = firstNonBlank(
            extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString()
        )

        val messageText = when {
            text.isNotBlank() -> text
            title.isNotBlank() -> title
            else -> {
                preferenceStore.setLastDeliveryStatus("Diabaikan • isi notifikasi kosong")
                return
            }
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
            packageName.contains("bca", ignoreCase = true) -> "BCA"
            packageName.contains("mandiri", ignoreCase = true) || packageName.contains("livin", ignoreCase = true) -> "Mandiri"
            packageName.contains("brimo", ignoreCase = true) || packageName.contains("bri", ignoreCase = true) -> "BRI"
            packageName.contains("bni", ignoreCase = true) -> "BNI"
            packageName.contains("bsi", ignoreCase = true) -> "BSI"
            packageName.contains("jago", ignoreCase = true) -> "Jago"
            packageName.contains("seabank", ignoreCase = true) -> "SeaBank"
            packageName.contains("jenius", ignoreCase = true) || packageName.contains("btpn", ignoreCase = true) -> "Jenius"
            packageName.contains("dana", ignoreCase = true) -> "DANA"
            packageName.contains("ovo", ignoreCase = true) -> "OVO"
            packageName.contains("gojek", ignoreCase = true) -> "GoPay"
            packageName.contains("shopee", ignoreCase = true) -> "ShopeePay"
            packageName.contains("flip", ignoreCase = true) -> "Flip"
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
            // BCA
            "com.bca", "com.bca.mybca", "com.bcadigital.blu",
            // Mandiri
            "id.co.bankmandiri.livin.android",
            // BRI
            "id.co.bri.brimo",
            // BNI
            "src.com.bni", "id.co.bni.mobilebanking",
            // BSI
            "com.bsi.mobile", "id.bsi.bsimobile", "id.co.bsi.mobile",
            // Bank Jago
            "com.jago.transactionApp",
            // SeaBank
            "com.bke.seabank",
            // Jenius (BTPN)
            "com.btpn.dc.madison",
            // E-Wallets
            "com.gojek.app",
            "ovo.id",
            "id.dana",
            "com.shopee.id",
            "com.flip.android"
        )

        private fun firstNonBlank(vararg values: String?): String {
            return values.firstOrNull { !it.isNullOrBlank() }?.trim().orEmpty()
        }

        private fun joinTextLines(values: Array<CharSequence>?): String {
            return values
                ?.map { it.toString().trim() }
                ?.filter { it.isNotBlank() }
                ?.joinToString(" ")
                .orEmpty()
        }
    }
}
