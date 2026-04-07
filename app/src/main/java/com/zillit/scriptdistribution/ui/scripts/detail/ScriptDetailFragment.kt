package com.zillit.scriptdistribution.ui.scripts.detail

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.zillit.scriptdistribution.R
import com.zillit.scriptdistribution.databinding.FragmentScriptDetailBinding

class ScriptDetailFragment : Fragment() {
    private var _binding: FragmentScriptDetailBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ScriptDetailViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentScriptDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val scriptId = arguments?.getString("scriptId") ?: return

        viewModel.loadScript(scriptId)
        viewModel.loadVersions(scriptId)

        viewModel.script.observe(viewLifecycleOwner) { script ->
            binding.tvTitle.text = script.title
            binding.tvDescription.text = script.description ?: ""
            binding.tvStatus.text = script.status ?: "draft"
            binding.tvFormat.text = script.format ?: "feature"
        }

        viewModel.versions.observe(viewLifecycleOwner) { versions ->
            binding.rvVersions.layoutManager = LinearLayoutManager(requireContext())
            // Simple text display of versions for now
        }

        binding.btnBreakdown.setOnClickListener {
            val versionId = viewModel.script.value?.currentVersion?.id
            if (versionId != null) {
                viewModel.triggerBreakdown(versionId)
                findNavController().navigate(
                    R.id.action_detail_to_breakdown,
                    bundleOf("versionId" to versionId, "scriptId" to scriptId)
                )
            } else {
                Toast.makeText(requireContext(), "No version available", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnDownload.setOnClickListener {
            val versionId = viewModel.script.value?.currentVersion?.id
            if (versionId != null) {
                viewModel.downloadVersion(versionId)
            }
        }

        binding.btnAnalytics.setOnClickListener {
            findNavController().navigate(
                R.id.action_detail_to_analytics,
                bundleOf("scriptId" to scriptId)
            )
        }

        viewModel.downloadUrl.observe(viewLifecycleOwner) { url ->
            if (url != null) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
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
