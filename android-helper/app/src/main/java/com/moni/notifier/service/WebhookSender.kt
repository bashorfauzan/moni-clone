package com.moni.notifier.service

import android.util.Log
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.concurrent.Executors
import java.util.Date
import java.util.Locale

class WebhookSender(
    private val preferenceStore: PreferenceStore
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val timeFormatter = SimpleDateFormat("dd MMM HH:mm:ss", Locale("id", "ID"))

    fun send(payload: JSONObject) {
        executor.execute {
            val endpoint = preferenceStore.getWebhookUrl()
            try {
                val connection = URL(endpoint).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000
                connection.doOutput = true

                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                val responseCode = connection.responseCode
                Log.d("MoniNotifier", "Webhook sent: $responseCode")
                val summary = payload.optString("text").take(48)
                preferenceStore.setLastDeliveryStatus(
                    "Berhasil ${timeFormatter.format(Date())} • HTTP $responseCode • $summary"
                )
                connection.disconnect()
            } catch (error: Exception) {
                Log.e("MoniNotifier", "Failed to send webhook", error)
                preferenceStore.setLastDeliveryStatus(
                    "Gagal ${timeFormatter.format(Date())} • ${error.message ?: "unknown error"}"
                )
            }
        }
    }
}
