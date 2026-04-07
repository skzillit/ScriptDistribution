package com.zillit.scriptdistribution.ui.scripts.list

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.zillit.scriptdistribution.data.models.Script
import com.zillit.scriptdistribution.databinding.ItemScriptBinding

class ScriptListAdapter(
    private val onClick: (Script) -> Unit
) : ListAdapter<Script, ScriptListAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemScriptBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemScriptBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(script: Script) {
            binding.tvTitle.text = script.title
            binding.tvDescription.text = script.description ?: ""
            binding.tvStatus.text = script.status ?: "draft"
            binding.tvFormat.text = script.format ?: "feature"
            binding.tvPages.text = script.currentVersion?.let { "${it.pageCount ?: 0} pages" } ?: ""
            binding.tvVersion.text = script.currentVersion?.let {
                it.versionLabel ?: "v${it.versionNumber}"
            } ?: ""
            binding.root.setOnClickListener { onClick(script) }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<Script>() {
        override fun areItemsTheSame(oldItem: Script, newItem: Script) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Script, newItem: Script) = oldItem == newItem
    }
}
