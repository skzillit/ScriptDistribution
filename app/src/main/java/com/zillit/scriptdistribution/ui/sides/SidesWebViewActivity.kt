package com.zillit.scriptdistribution.ui.sides

import android.os.Bundle
import android.view.MenuItem
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.google.gson.Gson
import com.zillit.scriptdistribution.databinding.ActivitySidesWebviewBinding
import com.zillit.scriptdistribution.util.EncryptionUtil
import com.zillit.scriptdistribution.util.TokenManager
import java.util.TimeZone

/**
 * In-app WebView for viewing sides / call sheets / scripts served by the backend.
 * Loads the URL with the same auth headers (moduledata, bodyhash, Timezone, deviceInfo)
 * that AuthInterceptor produces, so the backend authenticates the request.
 *
 * Usage:
 *   val intent = Intent(context, SidesWebViewActivity::class.java).apply {
 *     putExtra(SidesWebViewActivity.EXTRA_URL, "https://.../api/sides/123/view")
 *     putExtra(SidesWebViewActivity.EXTRA_TITLE, "Sides")
 *   }
 *   startActivity(intent)
 */
class SidesWebViewActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "extra_url"
        const val EXTRA_TITLE = "extra_title"
    }

    private lateinit var binding: ActivitySidesWebviewBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySidesWebviewBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val url = intent.getStringExtra(EXTRA_URL)
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "View"

        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = title
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        if (url.isNullOrBlank()) {
            finish()
            return
        }

        configureWebView(binding.webView)
        loadUrlWithAuth(binding.webView, url)
    }

    private fun configureWebView(webView: WebView) {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            allowFileAccess = true
            allowContentAccess = true
            // Allow mixed content for dev backend (HTTP) — production uses HTTPS so this is safe
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                binding.progressBar.visibility = android.view.View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                binding.progressBar.visibility = android.view.View.GONE
            }
        }
    }

    /**
     * Build the same auth headers the OkHttp AuthInterceptor adds, then load the URL
     * with those headers. The backend's moduleAuth middleware accepts them.
     */
    private fun loadUrlWithAuth(webView: WebView, url: String) {
        val gson = Gson()
        val moduleDataJson = gson.toJson(
            mapOf(
                "device_id" to TokenManager.getDeviceId(),
                "user_id" to TokenManager.getUserId().ifEmpty { null },
                "time_stamp" to System.currentTimeMillis()
            )
        )
        val encryptedModuleData = EncryptionUtil.encrypt(moduleDataJson)
        // GET requests have no body — pass null/empty
        val bodyHash = EncryptionUtil.generateBodyHash(null, encryptedModuleData)

        val headers = mapOf(
            "moduledata" to encryptedModuleData,
            "bodyhash" to bodyHash,
            "Timezone" to TimeZone.getDefault().id,
            "deviceInfo" to "${android.os.Build.MODEL}|${android.os.Build.VERSION.SDK_INT}|Android"
        )
        webView.loadUrl(url, headers)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            if (binding.webView.canGoBack()) {
                binding.webView.goBack()
            } else {
                finish()
            }
            return true
        }
        return super.onOptionsItemSelected(item)
    }

    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        binding.webView.destroy()
        super.onDestroy()
    }
}
