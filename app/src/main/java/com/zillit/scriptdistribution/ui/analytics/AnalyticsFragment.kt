package com.zillit.scriptdistribution.ui.analytics

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import com.zillit.scriptdistribution.databinding.FragmentAnalyticsBinding

class AnalyticsFragment : Fragment() {
    private var _binding: FragmentAnalyticsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AnalyticsViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentAnalyticsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val scriptId = arguments?.getString("scriptId")
        if (scriptId.isNullOrBlank()) {
            binding.tvNoData.visibility = View.VISIBLE
            return
        }

        viewModel.loadAnalytics(scriptId)

        viewModel.summary.observe(viewLifecycleOwner) { summary ->
            binding.tvViews.text = summary.totalViews.toString()
            binding.tvUniqueViewers.text = summary.uniqueViewers.toString()
            binding.tvDownloads.text = summary.totalDownloads.toString()
        }

        viewModel.loading.observe(viewLifecycleOwner) { loading ->
            binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
