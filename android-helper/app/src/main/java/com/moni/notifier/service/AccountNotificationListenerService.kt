package com.moni.notifier.service

import android.app.Notification
import android.content.ComponentName
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class AccountNotificationListenerService : NotificationListenerService() {
    private lateinit var preferenceStore: PreferenceStore
    private lateinit var webhookSender: WebhookSender
    private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")
        .withZone(ZoneId.systemDefault())

    override fun onCreate() {
        super.onCreate()
        preferenceStore = PreferenceStore(this)
        webhookSender = WebhookSender(preferenceStore)
        NotificationHelper.createChannel(this)
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        preferenceStore.setLastDeliveryStatus("Listener aktif • siap menangkap notifikasi")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        preferenceStore.setLastDeliveryStatus("Listener terputus • mencoba menyambungkan ulang")
        requestRebind(ComponentName(this, AccountNotificationListenerService::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val packageName = sbn.packageName ?: return
        if (packageName == applicationContext.packageName) return

        val isSupportedPackage = SUPPORTED_PACKAGES.contains(packageName) ||
            packageName.contains("bank", ignoreCase = true) ||
            packageName.contains("bca", ignoreCase = true) ||
            packageName.contains("wondr", ignoreCase = true) ||
            packageName.contains("livin", ignoreCase = true) ||
            packageName.contains("bri", ignoreCase = true) ||
            packageName.contains("bni", ignoreCase = true) ||
            packageName.contains("jago", ignoreCase = true) ||
            packageName.contains("dana", ignoreCase = true) ||
            packageName.contains("ovo", ignoreCase = true) ||
            packageName.contains("gojek", ignoreCase = true) ||
            packageName.contains("shopee", ignoreCase = true) ||
            packageName.contains("flip", ignoreCase = true)

        val appNameStr = resolveAppName(packageName)
        val extras = sbn.notification.extras
        val title = firstNonBlank(
            extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString(),
            extras.getCharSequence("android.title.big")?.toString()
        )
        val text = extractMessageText(sbn.notification, extras)
        val senderName = firstNonBlank(
            extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString(),
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
            .plus(appNameStr)
            .plus(packageName)
            .joinToString(" ")
            .lowercase()
        val filters = preferenceStore.getFilterKeywords()
            .split(",")
            .map { it.trim().lowercase() }
            .filter { it.isNotBlank() }
        val looksLikeTransaction = looksLikeFinancialTransaction(appNameStr, title, messageText, packageName)
        val matchesFilter = filters.isNotEmpty() && filters.any { keyword -> fullText.contains(keyword) }

        if (!isSupportedPackage && !looksLikeTransaction && !matchesFilter) {
            return
        }

        if (filters.isNotEmpty() && !matchesFilter && !looksLikeTransaction && isSupportedPackage) {
            val timeStr = timeFormatter.format(Instant.ofEpochMilli(sbn.postTime))
            preferenceStore.setLastDeliveryStatus(
                "Diabaikan $timeStr • tidak cocok filter"
            )
            return
        }

        val payload = JSONObject().apply {
            put("appName", appNameStr)
            put("title", title)
            put("senderName", senderName)
            put("text", messageText)
            put("receivedAt", Instant.ofEpochMilli(sbn.postTime).toString())
            put(
                "rawPayload",
                JSONObject().apply {
                    put("packageName", packageName)
                    put("notificationKey", sbn.key)
                    put("groupKey", sbn.groupKey)
                    put("isGroup", sbn.isGroup)
                    put("postTime", sbn.postTime)
                    put("isClearable", sbn.isClearable)
                    put("tag", sbn.tag)
                    put("channelId", sbn.notification.channelId)
                    put("category", sbn.notification.category)
                    put("extrasKeys", extras.keySet().joinToString(","))
                    put("androidTitle", title)
                    put("androidText", text)
                }
            )
        }

        webhookSender.send(payload) {
            val webAppUrl = preferenceStore.getWebAppUrl()
            if (webAppUrl.isNotBlank()) {
                NotificationHelper.showTransactionNotification(
                    context = this,
                    webAppUrl = webAppUrl,
                    appName = appNameStr,
                    text = messageText
                )
            }
        }
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

        private fun resolveAppName(packageName: String): String {
            return when {
                packageName.contains("bca", ignoreCase = true) -> "BCA"
                packageName.contains("wondr", ignoreCase = true) -> "BNI"
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
        }

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

        private fun extractMessageText(notification: Notification, extras: Bundle): String {
            return firstNonBlank(
                extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
                joinTextLines(extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)),
                joinMessagingTexts(extras.getParcelableArray(Notification.EXTRA_MESSAGES)),
                joinMessagingTexts(extras.getParcelableArray(Notification.EXTRA_HISTORIC_MESSAGES)),
                extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
                extras.getCharSequence("android.bigText")?.toString(),
                extras.getCharSequence("android.text")?.toString(),
                extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString(),
                notification.tickerText?.toString()
            )
        }

        private fun looksLikeFinancialTransaction(
            appName: String,
            title: String,
            text: String,
            packageName: String
        ): Boolean {
            val combined = listOf(appName, title, text, packageName)
                .joinToString(" ")
                .lowercase()

            val hasAmount = Regex("""\brp\s*[\d.,]+|\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\b""")
                .containsMatchIn(combined)
            if (!hasAmount) return false

            val transactionKeywords = listOf(
                "transfer", "kirim", "dikirim", "diterima", "masuk", "keluar",
                "pembayaran", "bayar", "briva", "debit", "kredit", "top up", "tarik",
                "berhasil", "pengisian saldo", "isi saldo", "topup", "saldo bertambah",
                "penerimaan", "pemasukan", "transaksi", "pembelian"
            )

            return transactionKeywords.any { combined.contains(it) }
        }

        private fun joinMessagingTexts(values: Array<android.os.Parcelable>?): String {
            if (values.isNullOrEmpty()) return ""

            return Notification.MessagingStyle.Message.getMessagesFromBundleArray(values)
                .mapNotNull { it.text?.toString()?.trim() }
                .filter { it.isNotBlank() }
                .distinct()
                .joinToString(" ")
        }
    }
}
