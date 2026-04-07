package com.zillit.scriptdistribution.ui.breakdown

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import com.google.android.material.chip.Chip
import com.zillit.scriptdistribution.R
import com.zillit.scriptdistribution.data.api.ApiClient
import com.zillit.scriptdistribution.databinding.FragmentBreakdownBinding

class BreakdownFragment : Fragment() {
    private var _binding: FragmentBreakdownBinding? = null
    private val binding get() = _binding!!
    private val viewModel: BreakdownViewModel by viewModels()

    private val categories = mapOf(
        "CAST_MEMBER" to Pair("Cast", "#FF6B6B"),
        "EXTRA" to Pair("Extra", "#FF8E8E"),
        "PROP" to Pair("Prop", "#4ECDC4"),
        "SET_DRESSING" to Pair("Set Dress.", "#45B7D1"),
        "LOCATION" to Pair("Location", "#96CEB4"),
        "VEHICLE" to Pair("Vehicle", "#FFEAA7"),
        "WARDROBE" to Pair("Wardrobe", "#DDA0DD"),
        "MAKEUP_HAIR" to Pair("Makeup", "#FFB6C1"),
        "VFX" to Pair("VFX", "#A29BFE"),
        "SFX" to Pair("SFX", "#FD79A8"),
        "SOUND_EFFECT" to Pair("Sound", "#E17055"),
        "STUNT" to Pair("Stunt", "#D63031"),
    )

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentBreakdownBinding.inflate(inflater, container, false)
        return binding.root
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val versionId = arguments?.getString("versionId") ?: return

        // Set up category chips
        categories.forEach { (key, value) ->
            val chip = Chip(requireContext()).apply {
                text = value.first
                isCheckable = true
                isChecked = true
                setOnCheckedChangeListener { _, checked ->
                    binding.webView.evaluateJavascript(
                        "toggleCategory('$key', $checked)", null
                    )
                }
            }
            binding.chipGroupCategories.addView(chip)
        }

        // Set up WebView
        binding.webView.settings.javaScriptEnabled = true
        binding.webView.settings.domStorageEnabled = true
        binding.webView.addJavascriptInterface(BreakdownJsBridge(), "AndroidBridge")
        binding.webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: android.webkit.WebView?, url: String?) {
                binding.progressBar.visibility = View.GONE
                binding.webView.visibility = View.VISIBLE
            }
        }

        // Poll breakdown status then load
        viewModel.loadBreakdown(versionId)

        viewModel.breakdown.observe(viewLifecycleOwner) { breakdown ->
            when (breakdown?.status) {
                "complete" -> {
                    binding.layoutProcessing.visibility = View.GONE
                    binding.progressBar.visibility = View.VISIBLE
                    binding.webView.loadUrl("${ApiClient.BASE_URL}/api/highlight/$versionId")
                }
                "processing", "pending" -> {
                    binding.layoutProcessing.visibility = View.VISIBLE
                    binding.webView.visibility = View.GONE
                }
                "error" -> {
                    binding.layoutProcessing.visibility = View.GONE
                    Toast.makeText(requireContext(), "Breakdown failed: ${breakdown.error}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    inner class BreakdownJsBridge {
        @JavascriptInterface
        fun onElementTapped(json: String) {
            activity?.runOnUiThread {
                Toast.makeText(requireContext(), "Element: $json", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun onPageViewed(pageNumber: Int) {
            // Record analytics event
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
