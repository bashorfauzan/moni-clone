package com.moni.notifier.service

import android.content.Context

class PreferenceStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        migrateLegacyPreferences(context)
        resetDeprecatedEndpointDefaultsIfNeeded()
        applyBundledDefaultsIfMissing()
    }

    fun getWebhookUrl(): String =
        prefs.getString(KEY_WEBHOOK_URL, DEFAULT_WEBHOOK_URL)
            ?.takeIf { it.isNotBlank() }
            ?: DEFAULT_WEBHOOK_URL

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
        prefs.getString(KEY_WEB_APP_URL, DEFAULT_WEB_APP_URL)
            ?.takeIf { it.isNotBlank() }
            ?: DEFAULT_WEB_APP_URL

    fun setWebAppUrl(value: String) {
        prefs.edit().putString(KEY_WEB_APP_URL, value).apply()
    }

    fun shouldOpenWebAppOnLaunch(): Boolean =
        prefs.getBoolean(KEY_OPEN_WEB_APP_ON_LAUNCH, DEFAULT_WEB_APP_URL.isNotBlank())

    fun setOpenWebAppOnLaunch(value: Boolean) {
        prefs.edit().putBoolean(KEY_OPEN_WEB_APP_ON_LAUNCH, value).apply()
    }

    fun isInitialSetupCompleted(): Boolean =
        prefs.getBoolean(KEY_INITIAL_SETUP_COMPLETED, DEFAULT_WEB_APP_URL.isNotBlank())

    fun setInitialSetupCompleted(value: Boolean) {
        prefs.edit().putBoolean(KEY_INITIAL_SETUP_COMPLETED, value).apply()
    }

    companion object {
        private const val PREFS_NAME = "nova_helper"
        private const val LEGACY_PREFS_NAME = "moni_notifier"
        private const val KEY_WEBHOOK_URL = "webhook_url"
        private const val KEY_FILTER_KEYWORDS = "filter_keywords"
        private const val KEY_LAST_DELIVERY_STATUS = "last_delivery_status"
        private const val KEY_WEB_APP_URL = "web_app_url"
        private const val KEY_OPEN_WEB_APP_ON_LAUNCH = "open_web_app_on_launch"
        private const val KEY_INITIAL_SETUP_COMPLETED = "initial_setup_completed"
        private const val DEFAULT_WEBHOOK_URL = "http://192.168.0.103:5001/api/webhook/notification"
        private const val DEFAULT_FILTER_KEYWORDS = "bca,bni,wondr,bri,brimo,bsi,mandiri,livin,seabank,jago,dana,gopay,ovo,shopeepay,flip,gaji,transfer,masuk,terima,diterima,keluar,pembayaran,briva,top up,debit,kredit,tarik"
        private const val DEFAULT_DELIVERY_STATUS = "Belum ada pengiriman"
        private const val DEFAULT_WEB_APP_URL = "http://192.168.0.103:5173"
        private val DEPRECATED_HOSTS = setOf(
            "moni-clone.vercel.app"
        )

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

    fun getContext(): Context = appContext

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

        val legacyWebAppUrl = legacyPrefs.getString(KEY_WEB_APP_URL, DEFAULT_WEB_APP_URL).orEmpty()
        val legacyOpenOnLaunch = legacyPrefs.getBoolean(KEY_OPEN_WEB_APP_ON_LAUNCH, false)
        if (legacyOpenOnLaunch && legacyWebAppUrl.isNotBlank()) {
            editor.putBoolean(KEY_INITIAL_SETUP_COMPLETED, true)
        }

        editor.apply()
    }

    private fun resetDeprecatedEndpointDefaultsIfNeeded() {
        val webhookUrl = prefs.getString(KEY_WEBHOOK_URL, DEFAULT_WEBHOOK_URL).orEmpty()
        val webAppUrl = prefs.getString(KEY_WEB_APP_URL, DEFAULT_WEB_APP_URL).orEmpty()
        val usesDeprecatedWebhook = usesDeprecatedHost(webhookUrl)
        val usesDeprecatedWebApp = usesDeprecatedHost(webAppUrl)

        if (!usesDeprecatedWebhook && !usesDeprecatedWebApp) return

        prefs.edit()
            .apply {
                if (usesDeprecatedWebhook) putString(KEY_WEBHOOK_URL, DEFAULT_WEBHOOK_URL)
                if (usesDeprecatedWebApp) putString(KEY_WEB_APP_URL, DEFAULT_WEB_APP_URL)
                putBoolean(KEY_INITIAL_SETUP_COMPLETED, false)
                putBoolean(KEY_OPEN_WEB_APP_ON_LAUNCH, false)
                putString(
                    KEY_LAST_DELIVERY_STATUS,
                    "Endpoint lama dinonaktifkan. Buka pengaturan NOVA lalu isi ulang URL backend dan web app."
                )
            }
            .apply()
    }

    private fun applyBundledDefaultsIfMissing() {
        var changed = false
        val editor = prefs.edit()
        val webhookUrl = prefs.getString(KEY_WEBHOOK_URL, null).orEmpty()
        val webAppUrl = prefs.getString(KEY_WEB_APP_URL, null).orEmpty()

        if (webhookUrl.isBlank() && DEFAULT_WEBHOOK_URL.isNotBlank()) {
            editor.putString(KEY_WEBHOOK_URL, DEFAULT_WEBHOOK_URL)
            changed = true
        }

        if (webAppUrl.isBlank() && DEFAULT_WEB_APP_URL.isNotBlank()) {
            editor.putString(KEY_WEB_APP_URL, DEFAULT_WEB_APP_URL)
            changed = true
        }

        if (DEFAULT_WEB_APP_URL.isNotBlank()) {
            if (!prefs.getBoolean(KEY_INITIAL_SETUP_COMPLETED, false)) {
                editor.putBoolean(KEY_INITIAL_SETUP_COMPLETED, true)
                changed = true
            }
            if (!prefs.getBoolean(KEY_OPEN_WEB_APP_ON_LAUNCH, false)) {
                editor.putBoolean(KEY_OPEN_WEB_APP_ON_LAUNCH, true)
                changed = true
            }
        }

        if (changed) {
            editor.apply()
        }
    }

    private fun usesDeprecatedHost(value: String): Boolean {
        if (value.isBlank()) return false
        return DEPRECATED_HOSTS.any { host ->
            value.contains(host, ignoreCase = true)
        }
    }
}
