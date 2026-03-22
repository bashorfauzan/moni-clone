package com.moni.notifier

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.moni.notifier.databinding.ActivityWebAppBinding
import org.json.JSONObject

class WebAppActivity : AppCompatActivity() {
    private lateinit var binding: ActivityWebAppBinding
    private lateinit var webAppUrl: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWebAppBinding.inflate(layoutInflater)
        setContentView(binding.root)

        webAppUrl = intent.getStringExtra(EXTRA_WEB_APP_URL).orEmpty()
        if (!isValidHttpUrl(webAppUrl)) {
            Toast.makeText(this, R.string.web_app_invalid_url, Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        binding.openBrowserButton.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webAppUrl)))
        }
        binding.reloadButton.setOnClickListener { binding.webView.reload() }
        binding.closeButton.setOnClickListener { finish() }

        setupWebView()
        binding.webView.loadUrl(webAppUrl)
    }

    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
            return
        }
        super.onBackPressed()
    }

    @Suppress("SetJavaScriptEnabled")
    private fun setupWebView() {
        binding.webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = false
            allowContentAccess = true
        }
        binding.webView.addJavascriptInterface(SpendNativeJsBridge(), JS_BRIDGE_NAME)
        binding.webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                binding.loadingBar.progress = newProgress
                binding.loadingBar.visibility = if (newProgress >= 100) android.view.View.GONE else android.view.View.VISIBLE
            }
        }
        binding.webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString().orEmpty()
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false
                }

                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    true
                } catch (_: Exception) {
                    false
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectNativeBridge()
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    val msg = getString(R.string.web_app_load_failed) + " (" + (error?.description ?: "Unknown") + ")"
                    Toast.makeText(this@WebAppActivity, msg, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun injectNativeBridge() {
        binding.webView.evaluateJavascript(
            """
            (function () {
              if (window.SpendNativeBridge && window.SpendNativeBridge.__androidReady) {
                return;
              }
              window.SpendNativeBridge = {
                __androidReady: true,
                openAccountApp: function (payload) {
                  try {
                    ${JS_BRIDGE_NAME}.openAccountApp(JSON.stringify(payload || {}));
                    return Promise.resolve({ ok: true });
                  } catch (error) {
                    return Promise.resolve({ ok: false, message: String(error) });
                  }
                }
              };
            })();
            """.trimIndent(),
            null
        )
    }

    private fun isValidHttpUrl(value: String): Boolean {
        if (value.isBlank()) return false
        val parsed = Uri.parse(value)
        return parsed.scheme == "http" || parsed.scheme == "https"
    }

    private inner class SpendNativeJsBridge {
        @JavascriptInterface
        fun openAccountApp(payloadJson: String) {
            runOnUiThread {
                handleAccountAppLaunch(payloadJson)
            }
        }
    }

    private fun handleAccountAppLaunch(payloadJson: String) {
        val payload = runCatching { JSONObject(payloadJson) }.getOrNull()
        val deepLink = payload?.optString("deepLink")?.takeIf { !it.isNullOrBlank() }
        val packageName = payload?.optString("packageName")?.takeIf { !it.isNullOrBlank() }
        val storeUrl = payload?.optString("storeUrl")?.takeIf { !it.isNullOrBlank() }

        if (deepLink != null && openIntent(Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)))) {
            Toast.makeText(this, R.string.account_app_opened, Toast.LENGTH_SHORT).show()
            return
        }

        if (packageName != null) {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null && openIntent(launchIntent)) {
                Toast.makeText(this, R.string.account_app_opened, Toast.LENGTH_SHORT).show()
                return
            }
        }

        if (storeUrl != null && openIntent(Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl)))) {
            Toast.makeText(this, R.string.account_store_opened, Toast.LENGTH_SHORT).show()
            return
        }

        Toast.makeText(this, R.string.account_open_failed, Toast.LENGTH_SHORT).show()
    }

    private fun openIntent(intent: Intent): Boolean {
        return try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (intent.resolveActivity(packageManager) == null) {
                false
            } else {
                startActivity(intent)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        private const val EXTRA_WEB_APP_URL = "web_app_url"
        private const val JS_BRIDGE_NAME = "SpendAndroidBridge"

        fun createIntent(context: Context, webAppUrl: String): Intent {
            return Intent(context, WebAppActivity::class.java)
                .putExtra(EXTRA_WEB_APP_URL, webAppUrl)
        }
    }
}
