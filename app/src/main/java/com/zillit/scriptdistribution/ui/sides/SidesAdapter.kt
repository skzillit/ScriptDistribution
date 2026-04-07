package com.zillit.scriptdistribution.ui.sides

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.zillit.scriptdistribution.data.models.Sides
import com.zillit.scriptdistribution.databinding.ItemSidesBinding

class SidesAdapter(
    private val onView: (Sides) -> Unit,
    private val onDownload: (Sides) -> Unit,
) : ListAdapter<Sides, SidesAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemSidesBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(private val binding: ItemSidesBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(sides: Sides) {
            binding.tvTitle.text = sides.title
            binding.tvScenes.text = "Scenes: ${sides.sceneNumbers?.joinToString(", ") ?: "—"}"
            binding.tvPages.text = "${sides.totalScenes ?: 0} scene(s)"
            binding.tvDownloads.text = "${sides.downloadCount ?: 0} downloads"
            binding.tvDate.text = sides.createdAt?.take(10) ?: ""

            binding.tvStatus.text = sides.status
            when (sides.status) {
                "ready" -> {
                    binding.tvStatus.setTextColor(binding.root.context.getColor(com.zillit.scriptdistribution.R.color.success))
                    binding.btnView.visibility = View.VISIBLE
                    binding.btnDownload.visibility = View.VISIBLE
                }
                "generating" -> {
                    binding.tvStatus.setTextColor(binding.root.context.getColor(com.zillit.scriptdistribution.R.color.warning))
                    binding.btnView.visibility = View.GONE
                    binding.btnDownload.visibility = View.GONE
                }
                else -> {
                    binding.tvStatus.setTextColor(binding.root.context.getColor(com.zillit.scriptdistribution.R.color.error))
                    binding.btnView.visibility = View.GONE
                    binding.btnDownload.visibility = View.GONE
                }
            }

            binding.btnView.setOnClickListener { onView(sides) }
            binding.btnDownload.setOnClickListener { onDownload(sides) }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<Sides>() {
        override fun areItemsTheSame(oldItem: Sides, newItem: Sides) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Sides, newItem: Sides) = oldItem == newItem
    }
}
