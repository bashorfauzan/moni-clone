package com.moni.notifier

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.moni.notifier.databinding.ActivityMainBinding
import com.moni.notifier.service.PreferenceStore

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var preferenceStore: PreferenceStore

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferenceStore = PreferenceStore(this)

        if (shouldAutoOpenWebApp(savedInstanceState)) {
            openWebApp(preferenceStore.getWebAppUrl(), finishCurrent = true)
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Request POST_NOTIFICATIONS on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        binding.baseUrlInput.setText(preferenceStore.getWebhookUrl())
        binding.webAppUrlInput.setText(preferenceStore.getWebAppUrl())
        binding.filterKeywordsInput.setText(preferenceStore.getFilterKeywords())

        binding.saveButton.setOnClickListener {
            val webAppUrl = binding.webAppUrlInput.text?.toString()?.trim().orEmpty()
            val rawWebhookUrl = binding.baseUrlInput.text?.toString()?.trim().orEmpty()
            val filterKeywords = binding.filterKeywordsInput.text?.toString()?.trim().orEmpty()

            if (!isValidHttpUrl(webAppUrl)) {
                binding.statusText.text = getString(R.string.status_invalid_url)
                Toast.makeText(this, R.string.status_invalid_url, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val webhookUrl = rawWebhookUrl.ifBlank { deriveWebhookUrlFromWebAppUrl(webAppUrl) }
            if (!isValidHttpUrl(webhookUrl)) {
                binding.statusText.text = getString(R.string.status_invalid_url)
                Toast.makeText(this, R.string.status_invalid_url, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            binding.baseUrlInput.setText(webhookUrl)
            preferenceStore.setWebhookUrl(webhookUrl)
            preferenceStore.setWebAppUrl(webAppUrl)
            preferenceStore.setFilterKeywords(filterKeywords)
            preferenceStore.setOpenWebAppOnLaunch(true)
            binding.statusText.text = when {
                !isSameOriginWebhook(webAppUrl, webhookUrl) -> getString(R.string.status_saved_origin_warning)
                rawWebhookUrl.isBlank() -> getString(R.string.status_saved_webhook_derived)
                else -> getString(R.string.status_saved)
            }
            binding.lastDeliveryText.text = preferenceStore.getLastDeliveryStatus()
            Toast.makeText(this, R.string.status_saved, Toast.LENGTH_SHORT).show()
        }

        binding.openSettingsButton.setOnClickListener {
            maybeShowRestrictedSettingsTip()
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        binding.openAppInfoButton.setOnClickListener {
            openAppInfo()
        }

        binding.openWebAppButton.setOnClickListener {
            val webAppUrl = binding.webAppUrlInput.text?.toString()?.trim().orEmpty()
            if (!isValidHttpUrl(webAppUrl)) {
                binding.statusText.text = getString(R.string.web_app_invalid_url)
                Toast.makeText(this, R.string.web_app_invalid_url, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            preferenceStore.setWebAppUrl(webAppUrl)
            preferenceStore.setOpenWebAppOnLaunch(true)
            binding.statusText.text = getString(R.string.status_opening_web_app)
            openWebApp(webAppUrl)
        }
    }

    override fun onResume() {
        super.onResume()
        val enabled = isNotificationServiceEnabled()
        binding.statusText.text = getString(
            if (enabled) R.string.status_enabled else R.string.status_disabled
        )
        binding.lastDeliveryText.text = preferenceStore.getLastDeliveryStatus()
        if (!enabled && shouldShowRestrictedSettingsTip()) {
            binding.statusText.append("\n" + getString(R.string.restricted_settings_toast))
        }
    }

    private fun isNotificationServiceEnabled(): Boolean {
        val packageName = packageName
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.split(":").any {
            val component = ComponentName.unflattenFromString(it)
            component?.packageName == packageName
        }
    }

    private fun isValidHttpUrl(value: String): Boolean {
        if (value.isBlank()) return false
        val parsed = Uri.parse(value)
        return parsed.scheme == "http" || parsed.scheme == "https"
    }

    private fun deriveWebhookUrlFromWebAppUrl(webAppUrl: String): String {
        val parsed = Uri.parse(webAppUrl)
        val builder = parsed.buildUpon()
        builder.path("/api/webhook/notification")
        builder.clearQuery()
        builder.fragment(null)
        return builder.build().toString()
    }

    private fun isSameOriginWebhook(webAppUrl: String, webhookUrl: String): Boolean {
        val webApp = Uri.parse(webAppUrl)
        val webhook = Uri.parse(webhookUrl)

        val webAppPort = if (webApp.port == -1) defaultPortForScheme(webApp.scheme) else webApp.port
        val webhookPort = if (webhook.port == -1) defaultPortForScheme(webhook.scheme) else webhook.port

        return webApp.scheme.equals(webhook.scheme, ignoreCase = true)
            && webApp.host.equals(webhook.host, ignoreCase = true)
            && webAppPort == webhookPort
    }

    private fun defaultPortForScheme(scheme: String?): Int {
        return when (scheme?.lowercase()) {
            "https" -> 443
            "http" -> 80
            else -> -1
        }
    }

    private fun maybeShowRestrictedSettingsTip() {
        if (!shouldShowRestrictedSettingsTip()) return

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.restricted_settings_title)
            .setMessage(R.string.restricted_settings_message)
            .setPositiveButton(R.string.open_app_info) { _, _ ->
                openAppInfo()
            }
            .setNegativeButton(android.R.string.ok, null)
            .show()
    }

    private fun shouldShowRestrictedSettingsTip(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !isNotificationServiceEnabled() &&
            isLikelySideLoadedInstall()
    }

    private fun isLikelySideLoadedInstall(): Boolean {
        val installerPackage = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            packageManager.getInstallSourceInfo(packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            packageManager.getInstallerPackageName(packageName)
        } ?: return true

        return installerPackage != "com.android.vending" &&
            installerPackage != "com.sec.android.app.samsungapps"
    }

    private fun openAppInfo() {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", packageName, null)
        )
        startActivity(intent)
    }

    private fun shouldAutoOpenWebApp(savedInstanceState: Bundle?): Boolean {
        if (savedInstanceState != null) return false
        if (intent?.getBooleanExtra(EXTRA_FORCE_SETUP, false) == true) return false
        if (!preferenceStore.shouldOpenWebAppOnLaunch()) return false

        val webAppUrl = preferenceStore.getWebAppUrl()
        return isValidHttpUrl(webAppUrl)
    }

    private fun openWebApp(webAppUrl: String, finishCurrent: Boolean = false) {
        startActivity(WebAppActivity.createIntent(this, webAppUrl))
        if (finishCurrent) {
            finish()
        }
    }

    companion object {
        private const val EXTRA_FORCE_SETUP = "force_setup"

        fun createSetupIntent(context: android.content.Context): Intent {
            return Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_FORCE_SETUP, true)
        }
    }
}
