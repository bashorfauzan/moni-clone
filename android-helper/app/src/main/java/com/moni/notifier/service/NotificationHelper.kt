package com.moni.notifier.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.moni.notifier.R
import com.moni.notifier.WebAppActivity
import java.util.concurrent.atomic.AtomicInteger

object NotificationHelper {

    private const val CHANNEL_ID = "nova_transactions"
    private const val CHANNEL_NAME = "Transaksi Nova"
    private const val CHANNEL_DESC = "Notifikasi transaksi keuangan yang terdeteksi Nova"
    private const val DELIVERY_CHANNEL_ID = "nova_delivery_status"
    private const val DELIVERY_CHANNEL_NAME = "Status Pengiriman Nova"
    private const val DELIVERY_CHANNEL_DESC = "Status kirim webhook notifikasi dari helper Android"

    private val notifId = AtomicInteger(1000)

    fun createChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = CHANNEL_DESC
            }
            manager.createNotificationChannel(channel)
        }

        if (manager.getNotificationChannel(DELIVERY_CHANNEL_ID) == null) {
            val deliveryChannel = NotificationChannel(
                DELIVERY_CHANNEL_ID,
                DELIVERY_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = DELIVERY_CHANNEL_DESC
            }
            manager.createNotificationChannel(deliveryChannel)
        }
    }

    fun showTransactionNotification(
        context: Context,
        webAppUrl: String,
        appName: String,
        text: String
    ) {
        createChannel(context)

        val openIntent = WebAppActivity.createIntent(context, webAppUrl).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notifId.get(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = "💸 Transaksi Terdeteksi · $appName"
        val shortText = if (text.length > 100) text.take(100) + "…" else text

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(shortText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notifId.getAndIncrement(), notification)
    }

    fun showDeliveryFailureNotification(
        context: Context,
        webAppUrl: String,
        title: String,
        text: String
    ) {
        createChannel(context)

        val openIntent = WebAppActivity.createIntent(context, webAppUrl).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notifId.get(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, DELIVERY_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notifId.getAndIncrement(), notification)
    }
}
