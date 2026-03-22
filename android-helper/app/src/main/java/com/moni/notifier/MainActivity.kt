package com.moni.notifier

import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.moni.notifier.databinding.ActivityMainBinding
import com.moni.notifier.service.PreferenceStore

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var preferenceStore: PreferenceStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        preferenceStore = PreferenceStore(this)
        binding.baseUrlInput.setText(preferenceStore.getWebhookUrl())
        binding.filterKeywordsInput.setText(preferenceStore.getFilterKeywords())

        binding.saveButton.setOnClickListener {
            val value = binding.baseUrlInput.text?.toString()?.trim().orEmpty()
            val filterKeywords = binding.filterKeywordsInput.text?.toString()?.trim().orEmpty()
            if (!value.startsWith("http://") && !value.startsWith("https://")) {
                binding.statusText.text = getString(R.string.status_invalid_url)
                Toast.makeText(this, R.string.status_invalid_url, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            preferenceStore.setWebhookUrl(value)
            preferenceStore.setFilterKeywords(filterKeywords)
            binding.statusText.text = getString(R.string.status_saved)
            binding.lastDeliveryText.text = preferenceStore.getLastDeliveryStatus()
            Toast.makeText(this, R.string.status_saved, Toast.LENGTH_SHORT).show()
        }

        binding.openSettingsButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }

    override fun onResume() {
        super.onResume()
        val enabled = isNotificationServiceEnabled()
        binding.statusText.text = getString(
            if (enabled) R.string.status_enabled else R.string.status_disabled
        )
        binding.lastDeliveryText.text = preferenceStore.getLastDeliveryStatus()
    }

    private fun isNotificationServiceEnabled(): Boolean {
        val packageName = packageName
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.split(":").any {
            val component = ComponentName.unflattenFromString(it)
            component?.packageName == packageName
        }
    }
}
