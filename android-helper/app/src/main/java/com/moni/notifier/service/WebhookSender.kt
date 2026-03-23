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
                val responseBody = readResponse(connection)
                val summary = payload.optString("text").take(48)
                if (responseCode in 200..299) {
                    Log.d(LOG_TAG, "Webhook sent: $responseCode")
                    preferenceStore.setLastDeliveryStatus(
                        "Berhasil ${timeFormatter.format(Date())} • HTTP $responseCode • $summary"
                    )
                } else {
                    Log.e(LOG_TAG, "Webhook failed: $responseCode $responseBody")
                    preferenceStore.setLastDeliveryStatus(
                        "Gagal ${timeFormatter.format(Date())} • HTTP $responseCode • ${responseBody.take(80)}"
                    )
                }
                connection.disconnect()
            } catch (error: Exception) {
                Log.e(LOG_TAG, "Failed to send webhook", error)
                preferenceStore.setLastDeliveryStatus(
                    "Gagal ${timeFormatter.format(Date())} • ${error.message ?: "unknown error"}"
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

    companion object {
        private const val LOG_TAG = "NovaHelper"
    }
}
