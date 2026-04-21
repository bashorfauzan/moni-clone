package com.moni.notifier.service

import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
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

    fun send(payload: JSONObject, onSuccess: (() -> Unit)? = null) {
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
                val responseBody = readResponse(connection)
                val summary = payload.optString("text").take(48)
                if (responseCode in 200..299) {
                    Log.d(LOG_TAG, "Webhook sent: $responseCode")
                    preferenceStore.setLastDeliveryStatus(
                        buildSuccessStatus(responseCode, responseBody, summary)
                    )
                    onSuccess?.invoke()
                } else {
                    Log.e(LOG_TAG, "Webhook failed: $responseCode $responseBody")
                    val status = "Gagal ${timeFormatter.format(Date())} • HTTP $responseCode • ${responseBody.take(80)}"
                    preferenceStore.setLastDeliveryStatus(status)
                    NotificationHelper.showDeliveryFailureNotification(
                        context = preferenceStore.getContext(),
                        webAppUrl = preferenceStore.getWebAppUrl(),
                        title = "Webhook NOVA gagal",
                        text = status
                    )
                }
                connection.disconnect()
            } catch (error: Exception) {
                Log.e(LOG_TAG, "Failed to send webhook", error)
                val status = "Gagal ${timeFormatter.format(Date())} • ${error.message ?: "unknown error"}"
                preferenceStore.setLastDeliveryStatus(status)
                NotificationHelper.showDeliveryFailureNotification(
                    context = preferenceStore.getContext(),
                    webAppUrl = preferenceStore.getWebAppUrl(),
                    title = "Webhook NOVA gagal",
                    text = status
                )
            }
        }
    }

    private fun readResponse(connection: HttpURLConnection): String {
        val stream = if (connection.responseCode >= 400) {
            connection.errorStream
        } else {
            connection.inputStream
        } ?: return ""

        return BufferedReader(InputStreamReader(stream)).use { reader ->
            reader.readText().replace("\\s+".toRegex(), " ").trim()
        }
    }

    private fun buildSuccessStatus(responseCode: Int, responseBody: String, summary: String): String {
        val timestamp = timeFormatter.format(Date())
        return try {
            val json = JSONObject(responseBody)
            val createdTransaction = json.optBoolean("createdTransaction", false)
            val reason = json.optString("reason").takeIf { it.isNotBlank() }
            val statusLabel = when {
                createdTransaction -> "Masuk ${timestamp} • transaksi dibuat"
                responseCode == 202 -> "Masuk ${timestamp} • inbox saja"
                else -> "Berhasil ${timestamp} • HTTP $responseCode"
            }

            listOfNotNull(
                statusLabel,
                reason?.take(48),
                summary.takeIf { it.isNotBlank() }
            ).joinToString(" • ")
        } catch (_: Exception) {
            "Berhasil ${timestamp} • HTTP $responseCode • $summary"
        }
    }

    companion object {
        private const val LOG_TAG = "NovaHelper"
    }
}
