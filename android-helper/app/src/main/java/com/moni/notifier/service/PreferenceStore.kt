package com.moni.notifier.service

import android.content.Context

class PreferenceStore(context: Context) {
    private val prefs = context.getSharedPreferences("moni_notifier", Context.MODE_PRIVATE)

    fun getWebhookUrl(): String =
        prefs.getString(KEY_WEBHOOK_URL, DEFAULT_WEBHOOK_URL) ?: DEFAULT_WEBHOOK_URL

    fun setWebhookUrl(value: String) {
        prefs.edit().putString(KEY_WEBHOOK_URL, value).apply()
    }

    fun getFilterKeywords(): String =
        prefs.getString(KEY_FILTER_KEYWORDS, DEFAULT_FILTER_KEYWORDS) ?: DEFAULT_FILTER_KEYWORDS

    fun setFilterKeywords(value: String) {
        prefs.edit().putString(KEY_FILTER_KEYWORDS, value).apply()
    }

    fun getLastDeliveryStatus(): String =
        prefs.getString(KEY_LAST_DELIVERY_STATUS, DEFAULT_DELIVERY_STATUS) ?: DEFAULT_DELIVERY_STATUS

    fun setLastDeliveryStatus(value: String) {
        prefs.edit().putString(KEY_LAST_DELIVERY_STATUS, value).apply()
    }

    fun getWebAppUrl(): String =
        prefs.getString(KEY_WEB_APP_URL, DEFAULT_WEB_APP_URL) ?: DEFAULT_WEB_APP_URL

    fun setWebAppUrl(value: String) {
        prefs.edit().putString(KEY_WEB_APP_URL, value).apply()
    }

    companion object {
        private const val KEY_WEBHOOK_URL = "webhook_url"
        private const val KEY_FILTER_KEYWORDS = "filter_keywords"
        private const val KEY_LAST_DELIVERY_STATUS = "last_delivery_status"
        private const val KEY_WEB_APP_URL = "web_app_url"
        private const val DEFAULT_WEBHOOK_URL = "https://moni-clone-production.up.railway.app/api/webhook/notification"
        private const val DEFAULT_FILTER_KEYWORDS = "bca,bni,bri,mandiri,seabank,dana,gopay,ovo,flip,gaji,transfer,masuk,keluar,top up"
        private const val DEFAULT_DELIVERY_STATUS = "Belum ada pengiriman"
        private const val DEFAULT_WEB_APP_URL = "https://invigorating-cat-production-291b.up.railway.app"
    }
}
