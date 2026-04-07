package com.zillit.scriptdistribution.ui.scripts.list

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.zillit.scriptdistribution.R
import com.zillit.scriptdistribution.databinding.FragmentScriptListBinding

class ScriptListFragment : Fragment() {
    private var _binding: FragmentScriptListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ScriptListViewModel by viewModels()
    private lateinit var adapter: ScriptListAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentScriptListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = ScriptListAdapter { script ->
            findNavController().navigate(
                R.id.action_list_to_detail,
                bundleOf("scriptId" to script.id)
            )
        }

        binding.rvScripts.layoutManager = LinearLayoutManager(requireContext())
        binding.rvScripts.adapter = adapter

        binding.fabUpload.setOnClickListener {
            findNavController().navigate(R.id.action_list_to_upload)
        }

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadScripts()
        }

        viewModel.scripts.observe(viewLifecycleOwner) { scripts ->
            adapter.submitList(scripts)
            binding.tvEmpty.visibility = if (scripts.isEmpty()) View.VISIBLE else View.GONE
        }

        viewModel.loading.observe(viewLifecycleOwner) { loading ->
            binding.swipeRefresh.isRefreshing = loading
            binding.progressBar.visibility = if (loading && adapter.itemCount == 0) View.VISIBLE else View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
