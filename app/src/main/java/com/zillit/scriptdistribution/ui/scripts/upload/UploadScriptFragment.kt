package com.zillit.scriptdistribution.ui.scripts.upload

import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.zillit.scriptdistribution.R
import com.zillit.scriptdistribution.databinding.FragmentUploadScriptBinding

class UploadScriptFragment : Fragment() {
    private var _binding: FragmentUploadScriptBinding? = null
    private val binding get() = _binding!!
    private val viewModel: UploadScriptViewModel by viewModels()
    private var selectedUri: Uri? = null

    private val pdfPicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            selectedUri = it
            val name = getFileName(it)
            binding.tvFileName.text = name
            binding.tvFileSize.visibility = View.VISIBLE
            binding.tvFileSize.text = getFileSize(it)
            binding.btnUpload.isEnabled = true
            if (binding.etTitle.text.isNullOrBlank()) {
                binding.etTitle.setText(name?.removeSuffix(".pdf") ?: "")
            }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentUploadScriptBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.cardPdfPicker.setOnClickListener {
            pdfPicker.launch("application/pdf")
        }

        binding.btnUpload.setOnClickListener {
            val uri = selectedUri ?: return@setOnClickListener
            val title = binding.etTitle.text.toString().trim()
            val description = binding.etDescription.text.toString().trim()
            if (title.isBlank()) {
                binding.etTitle.error = "Title is required"
                return@setOnClickListener
            }
            viewModel.uploadScript(requireContext(), uri, title, description)
        }

        viewModel.uploadProgress.observe(viewLifecycleOwner) { progress ->
            binding.progressBar.visibility = if (progress in 1..99) View.VISIBLE else View.GONE
            binding.progressBar.progress = progress
        }

        viewModel.scriptId.observe(viewLifecycleOwner) { scriptId ->
            if (scriptId != null) {
                Toast.makeText(requireContext(), "Script uploaded!", Toast.LENGTH_SHORT).show()
                findNavController().navigate(
                    R.id.scriptDetailFragment,
                    bundleOf("scriptId" to scriptId)
                )
            }
        }

        viewModel.error.observe(viewLifecycleOwner) { error ->
            if (error != null) {
                Toast.makeText(requireContext(), error, Toast.LENGTH_LONG).show()
            }
        }

        viewModel.loading.observe(viewLifecycleOwner) { loading ->
            binding.btnUpload.isEnabled = !loading && selectedUri != null
        }
    }

    private fun getFileName(uri: Uri): String? {
        val cursor = requireContext().contentResolver.query(uri, null, null, null, null)
        return cursor?.use {
            val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            it.moveToFirst()
            it.getString(nameIndex)
        }
    }

    private fun getFileSize(uri: Uri): String {
        val cursor = requireContext().contentResolver.query(uri, null, null, null, null)
        return cursor?.use {
            val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
            it.moveToFirst()
            val bytes = it.getLong(sizeIndex)
            "%.2f MB".format(bytes / 1024.0 / 1024.0)
        } ?: ""
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
