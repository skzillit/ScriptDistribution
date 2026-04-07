package com.zillit.scriptdistribution.ui.sides

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.zillit.scriptdistribution.data.api.ApiClient
import com.zillit.scriptdistribution.data.models.GenerateSidesRequest
import com.zillit.scriptdistribution.databinding.FragmentSidesBinding

class SidesFragment : Fragment() {
    private var _binding: FragmentSidesBinding? = null
    private val binding get() = _binding!!
    private val viewModel: SidesViewModel by viewModels()
    private lateinit var sidesAdapter: SidesAdapter
    private var showingSides = true

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentSidesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        sidesAdapter = SidesAdapter(
            onView = { sides ->
                val url = "${ApiClient.BASE_URL}/api/sides/${sides.id}/view"
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            },
            onDownload = { sides ->
                viewModel.downloadSides(sides.id)
            }
        )

        binding.rvList.layoutManager = LinearLayoutManager(requireContext())
        binding.rvList.adapter = sidesAdapter

        // Tab switching
        binding.btnTabSides.setOnClickListener {
            showingSides = true
            updateTabUI()
            viewModel.loadSides()
        }

        binding.btnTabCallsheets.setOnClickListener {
            showingSides = false
            updateTabUI()
            viewModel.loadCallSheets()
        }

        binding.swipeRefresh.setOnRefreshListener {
            if (showingSides) viewModel.loadSides() else viewModel.loadCallSheets()
        }

        // Generate sides FAB
        binding.fabGenerate.setOnClickListener {
            showGenerateDialog()
        }

        // Observers
        viewModel.sidesList.observe(viewLifecycleOwner) { sides ->
            if (showingSides) {
                sidesAdapter.submitList(sides)
                binding.tvEmpty.visibility = if (sides.isEmpty()) View.VISIBLE else View.GONE
            }
        }

        viewModel.loading.observe(viewLifecycleOwner) { loading ->
            binding.swipeRefresh.isRefreshing = loading
            binding.progressBar.visibility =
                if (loading && sidesAdapter.itemCount == 0) View.VISIBLE else View.GONE
        }

        viewModel.downloadUrl.observe(viewLifecycleOwner) { url ->
            if (url != null) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
        }

        viewModel.error.observe(viewLifecycleOwner) { err ->
            if (err != null) {
                Toast.makeText(requireContext(), err, Toast.LENGTH_LONG).show()
            }
        }

        // Initial load
        viewModel.loadSides()
    }

    private fun updateTabUI() {
        if (showingSides) {
            binding.btnTabSides.setBackgroundColor(requireContext().getColor(com.zillit.scriptdistribution.R.color.accent))
            binding.btnTabCallsheets.setBackgroundColor(requireContext().getColor(com.zillit.scriptdistribution.R.color.bg_card))
        } else {
            binding.btnTabSides.setBackgroundColor(requireContext().getColor(com.zillit.scriptdistribution.R.color.bg_card))
            binding.btnTabCallsheets.setBackgroundColor(requireContext().getColor(com.zillit.scriptdistribution.R.color.accent))
        }
    }

    private fun showGenerateDialog() {
        val input = android.widget.EditText(requireContext()).apply {
            hint = "Scene numbers (e.g. 1, 3, 5-8, 12A)"
            setPadding(48, 32, 48, 16)
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Generate Sides")
            .setMessage("Enter scene numbers to extract from script. You can also upload a call sheet first.")
            .setView(input)
            .setPositiveButton("Generate") { _, _ ->
                val scenes = input.text.toString().trim()
                if (scenes.isNotBlank()) {
                    // For now, generate with manual scene input
                    // TODO: Add script picker dialog
                    Toast.makeText(requireContext(),
                        "Please use the web app to select a script and generate sides.",
                        Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
