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
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Request POST_NOTIFICATIONS on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val enabled = isNotificationServiceEnabled()

        preferenceStore = PreferenceStore(this)
        
        if (enabled) {
            startActivity(WebAppActivity.createIntent(this, preferenceStore.getWebAppUrl()))
            finish()
            return
        }

        binding.baseUrlInput.setText(preferenceStore.getWebhookUrl())
        binding.webAppUrlInput.setText(preferenceStore.getWebAppUrl())
        binding.filterKeywordsInput.setText(preferenceStore.getFilterKeywords())

        binding.saveButton.setOnClickListener {
            val value = binding.baseUrlInput.text?.toString()?.trim().orEmpty()
            val webAppUrl = binding.webAppUrlInput.text?.toString()?.trim().orEmpty()
            val filterKeywords = binding.filterKeywordsInput.text?.toString()?.trim().orEmpty()
            if (!isValidHttpUrl(value) || !isValidHttpUrl(webAppUrl)) {
                binding.statusText.text = getString(R.string.status_invalid_url)
                Toast.makeText(this, R.string.status_invalid_url, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            preferenceStore.setWebhookUrl(value)
            preferenceStore.setWebAppUrl(webAppUrl)
            preferenceStore.setFilterKeywords(filterKeywords)
            binding.statusText.text = getString(R.string.status_saved)
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
            binding.statusText.text = getString(R.string.status_opening_web_app)
            startActivity(WebAppActivity.createIntent(this, webAppUrl))
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
}
