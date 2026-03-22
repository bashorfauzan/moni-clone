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
        if (packageName !in SUPPORTED_PACKAGES) return

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

        val payload = JSONObject().apply {
            put("appName", "WhatsApp")
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
        private val SUPPORTED_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
    }
}
