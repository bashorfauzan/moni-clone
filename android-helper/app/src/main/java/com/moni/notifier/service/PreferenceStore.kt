package com.moni.notifier.service

import android.content.Context

class PreferenceStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        migrateLegacyPreferences(context)
    }

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
        private const val PREFS_NAME = "nova_helper"
        private const val LEGACY_PREFS_NAME = "moni_notifier"
        private const val KEY_WEBHOOK_URL = "webhook_url"
        private const val KEY_FILTER_KEYWORDS = "filter_keywords"
        private const val KEY_LAST_DELIVERY_STATUS = "last_delivery_status"
        private const val KEY_WEB_APP_URL = "web_app_url"
        private const val DEFAULT_WEBHOOK_URL = "https://moni-clone-production.up.railway.app/api/webhook/notification"
        private const val DEFAULT_FILTER_KEYWORDS = "bca,bni,wondr,bri,brimo,bsi,mandiri,livin,seabank,jago,dana,gopay,ovo,shopeepay,flip,gaji,transfer,masuk,terima,diterima,keluar,pembayaran,briva,top up,debit,kredit,tarik"
        private const val DEFAULT_DELIVERY_STATUS = "Belum ada pengiriman"
        private const val DEFAULT_WEB_APP_URL = "https://invigorating-cat-production-291b.up.railway.app"

        private fun copyIfMissing(target: android.content.SharedPreferences.Editor, key: String, value: Any?) {
            when (value) {
                is String -> target.putString(key, value)
                is Boolean -> target.putBoolean(key, value)
                is Int -> target.putInt(key, value)
                is Long -> target.putLong(key, value)
                is Float -> target.putFloat(key, value)
            }
        }
    }

    private fun migrateLegacyPreferences(context: Context) {
        if (prefs.contains(KEY_WEBHOOK_URL) || prefs.contains(KEY_WEB_APP_URL) || prefs.contains(KEY_FILTER_KEYWORDS)) {
            return
        }

        val legacyPrefs = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
        if (legacyPrefs.all.isEmpty()) return

        val editor = prefs.edit()
        legacyPrefs.all.forEach { (key, value) ->
            copyIfMissing(editor, key, value)
        }
        editor.apply()
    }
}
