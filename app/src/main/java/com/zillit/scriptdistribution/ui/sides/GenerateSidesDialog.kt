package com.zillit.scriptdistribution.ui.sides

import android.content.DialogInterface
import android.content.res.Resources
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.zillit.scriptdistribution.R
import com.zillit.scriptdistribution.data.api.ApiClient
import com.zillit.scriptdistribution.data.models.CallSheet
import com.zillit.scriptdistribution.data.models.GenerateSidesRequest
import com.zillit.scriptdistribution.data.models.Script
import com.zillit.scriptdistribution.data.models.ShootDay
import com.zillit.scriptdistribution.data.models.ShootingSchedule
import com.zillit.scriptdistribution.databinding.DialogGenerateSidesBinding
import kotlinx.coroutines.launch

/**
 * Generate Sides dialog — mirrors the web `GenerateSidesModal` (titled "Customize Sides").
 *
 * On open it auto-loads:
 *   - The active script (via /scripts/active)
 *   - The latest call sheet (read-only display) + its scenes as chips
 *   - The latest shooting schedule (read-only display)
 *   - The matching shoot day for the call sheet scenes
 *
 * User can pick page count to include from the call sheet (All / 1 / 2 / 3),
 * toggle "Include Schedule", and type additional scene numbers manually.
 *
 * On Submit it builds a GenerateSidesRequest equivalent to the web payload and POSTs to /api/sides.
 */
class GenerateSidesDialog : BottomSheetDialogFragment() {

    private var _binding: DialogGenerateSidesBinding? = null
    private val binding get() = _binding!!

    private var activeScript: Script? = null
    private var latestCallSheet: CallSheet? = null
    private var latestSchedule: ShootingSchedule? = null

    private var callSheetPages: String = "all"
    private var matchedDay: ShootDay? = null
    private var matchedSceneNumbers: Set<String> = emptySet()
    private var extraScenes: List<ExtraScene> = emptyList()

    /** Listener for parent fragments. */
    var onSidesGenerated: (() -> Unit)? = null

    private data class ExtraScene(val sceneNumber: String, val day: ShootDay)

    override fun getTheme(): Int = R.style.Theme_ScriptDistribution_BottomSheet

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = DialogGenerateSidesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onStart() {
        super.onStart()
        // Expand the bottom sheet to ~90% of screen height by default so the long
        // form is comfortably visible without needing to drag up immediately.
        val dlg = dialog as? BottomSheetDialog ?: return
        val sheet = dlg.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet) ?: return
        val behavior = BottomSheetBehavior.from(sheet)
        val screenHeight = Resources.getSystem().displayMetrics.heightPixels
        behavior.peekHeight = (screenHeight * 0.9f).toInt()
        behavior.state = BottomSheetBehavior.STATE_EXPANDED
        behavior.skipCollapsed = true
        // Constrain height so the sheet never goes above 95% — leaves a status-bar gap
        sheet.layoutParams = sheet.layoutParams.apply {
            height = (screenHeight * 0.95f).toInt()
        }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Call sheet pages always defaults to "all" (selector hidden).
        binding.cbIncludeSchedule.setOnCheckedChangeListener { _, _ -> updateSummary() }
        binding.cbUseCallsheetScenes.setOnCheckedChangeListener { _, _ ->
            computeMatchedShootDay()
            updateSummary()
        }
        binding.etManualScenes.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { updateSummary() }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })

        binding.btnCancel.setOnClickListener { dismiss() }
        binding.btnSubmit.setOnClickListener { submitGeneration() }

        loadInitialData()
    }

    private fun loadInitialData() {
        binding.btnSubmit.isEnabled = false
        binding.btnSubmit.text = "Loading..."

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                // Active script
                val activeRes = ApiClient.apiService.getActiveScript()
                activeScript = activeRes.body()?.script
                renderActiveScript()

                // Call sheets — pick latest draft (or first)
                val csRes = ApiClient.apiService.listCallSheets(limit = 100)
                val callSheets = csRes.body()?.callSheets ?: emptyList()
                latestCallSheet = callSheets.firstOrNull { it.status == "draft" } ?: callSheets.firstOrNull()
                // If we have a basic version, fetch full detail with scenes
                latestCallSheet?.id?.let { id ->
                    val detailRes = ApiClient.apiService.getCallSheet(id)
                    detailRes.body()?.callSheet?.let { latestCallSheet = it }
                }
                renderCallSheet()

                // Schedules — pick latest draft (or first)
                val schedRes = ApiClient.apiService.listSchedules(limit = 100)
                val schedules = schedRes.body()?.schedules ?: emptyList()
                latestSchedule = schedules.firstOrNull { it.status == "draft" } ?: schedules.firstOrNull()
                latestSchedule?.id?.let { id ->
                    val detailRes = ApiClient.apiService.getSchedule(id)
                    detailRes.body()?.schedule?.let { latestSchedule = it }
                }
                renderSchedule()
                computeMatchedShootDay()

                updateSummary()
                binding.btnSubmit.isEnabled = (activeScript != null)
                binding.btnSubmit.text = "Submit"
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Failed to load: ${e.message}", Toast.LENGTH_LONG).show()
                binding.btnSubmit.text = "Submit"
            }
        }
    }

    private fun renderActiveScript() {
        val s = activeScript
        if (s != null) {
            binding.tvScriptTitle.text = s.title
            val pages = s.currentVersion?.pageCount?.let { "$it pages" } ?: ""
            val versionLabel = s.currentVersion?.versionLabel ?: s.currentVersion?.versionNumber?.let { "v$it" } ?: ""
            binding.tvScriptMeta.text = listOf(versionLabel, pages).filter { it.isNotBlank() }.joinToString(" · ")
        } else {
            binding.tvScriptTitle.text = "No active script"
            binding.tvScriptMeta.text = "Upload a script first"
        }
    }

    private fun renderCallSheet() {
        val cs = latestCallSheet
        if (cs == null) {
            binding.tvCallsheetTitle.text = "No call sheet uploaded"
            binding.tvCallsheetMeta.text = ""
            binding.cbUseCallsheetScenes.visibility = View.GONE
            binding.cbIncludeCallsheet.visibility = View.GONE
            return
        }

        binding.tvCallsheetTitle.text = cs.title
        val sceneCount = cs.scenes?.size ?: 0
        val callTimeStr = cs.crewCall?.let { " · Call: $it" } ?: ""
        binding.tvCallsheetMeta.text = "$sceneCount scenes$callTimeStr"

        // Call sheet option toggles
        binding.cbUseCallsheetScenes.visibility = View.VISIBLE
        binding.cbIncludeCallsheet.visibility = View.VISIBLE
    }

    private fun renderSchedule() {
        val sc = latestSchedule
        if (sc == null) {
            binding.tvScheduleTitle.text = "No shooting schedule uploaded"
            binding.tvScheduleMeta.text = ""
            binding.cbIncludeSchedule.visibility = View.GONE
            return
        }
        binding.tvScheduleTitle.text = sc.title
        binding.tvScheduleMeta.text = "${sc.totalDays ?: 0} days · ${sc.totalScenes ?: 0} scenes"
        binding.cbIncludeSchedule.visibility = View.VISIBLE
    }

    /**
     * Find the shoot day with the highest scene overlap. Matches against the
     * call sheet's scenes normally, or the custom scene list when the user has
     * turned off "use scenes from call sheet".
     */
    private fun computeMatchedShootDay() {
        val sc = latestSchedule ?: return
        matchedDay = null
        matchedSceneNumbers = emptySet()
        extraScenes = emptyList()
        val useCs = binding.cbUseCallsheetScenes.isChecked
        val csNums = if (useCs) {
            (latestCallSheet?.scenes ?: emptyList()).map { it.sceneNumber.uppercase() }.toSet()
        } else {
            finalSceneNumbers().map { it.uppercase() }.toSet()
        }
        if (csNums.isEmpty()) return

        var bestDay: ShootDay? = null
        var bestOverlap = emptyList<String>()
        for (day in sc.shootDays ?: emptyList()) {
            val overlap = (day.scenes ?: emptyList())
                .mapNotNull { it.sceneNumber?.uppercase() }
                .filter { csNums.contains(it) }
            if (overlap.size > bestOverlap.size) {
                bestOverlap = overlap
                bestDay = day
            }
        }
        matchedDay = bestDay
        matchedSceneNumbers = bestOverlap.toSet()

        // Extras: call sheet scenes NOT in best day → look up in other days
        if (bestDay != null) {
            val extras = mutableListOf<ExtraScene>()
            val notInBestDay = csNums - matchedSceneNumbers
            for (sn in notInBestDay) {
                val dayWithIt = (sc.shootDays ?: emptyList()).firstOrNull { d ->
                    (d.scenes ?: emptyList()).any { it.sceneNumber?.uppercase() == sn }
                }
                if (dayWithIt != null) extras.add(ExtraScene(sn, dayWithIt))
            }
            extraScenes = extras
        }
    }

    /** Build the final list of scene numbers (call sheet + manual, or custom only). */
    private fun finalSceneNumbers(): List<String> {
        val set = linkedSetOf<String>()
        // Call sheet scenes — only when the user opted to use them
        if (binding.cbUseCallsheetScenes.isChecked) {
            latestCallSheet?.scenes?.forEach { it.sceneNumber.let(set::add) }
        }
        // Manual input
        val manual = binding.etManualScenes.text?.toString() ?: ""
        if (manual.isNotBlank()) {
            manual.split(Regex("[,;\\s]+")).filter { it.isNotBlank() }.forEach { set.add(it.trim()) }
        }
        return set.toList()
    }

    private fun updateSummary() {
        val scenes = finalSceneNumbers()
        if (scenes.isEmpty()) {
            binding.cardSummary.visibility = View.GONE
            return
        }
        binding.cardSummary.visibility = View.VISIBLE
        val include = binding.cbIncludeSchedule.isChecked && matchedDay != null
        val scheduleStr = if (include) "  + 1 shoot day" else ""
        binding.tvSummary.text = "${scenes.size} scene(s): ${scenes.joinToString(", ")}$scheduleStr"
    }

    private fun submitGeneration() {
        val script = activeScript ?: run {
            Toast.makeText(requireContext(), "No active script found", Toast.LENGTH_LONG).show()
            return
        }
        val scenes = finalSceneNumbers()
        if (scenes.isEmpty()) {
            Toast.makeText(requireContext(), "Please add at least one scene", Toast.LENGTH_LONG).show()
            return
        }

        binding.btnSubmit.isEnabled = false
        binding.btnSubmit.text = "Submitting..."

        val includeSched = binding.cbIncludeSchedule.isChecked && matchedDay != null
        val matched = matchedDay
        val matchedDaysList: List<Int>? = if (includeSched && matched != null) {
            val days = mutableSetOf<Int>()
            matched.dayNumber?.let(days::add)
            extraScenes.forEach { ex -> ex.day.dayNumber?.let(days::add) }
            days.toList()
        } else null

        val useCallSheetScenes = binding.cbUseCallsheetScenes.isChecked
        val attachCallSheet = latestCallSheet != null && binding.cbIncludeCallsheet.isChecked

        val request = GenerateSidesRequest(
            scriptId = script.id,
            callSheetId = latestCallSheet?.id,
            sceneNumbers = scenes.joinToString(", "),
            title = binding.etTitle.text?.toString()?.takeIf { it.isNotBlank() },
            mode = "manual",
            includeCallSheet = attachCallSheet,
            includeCallSheetScenes = useCallSheetScenes,
            callSheetPages = if (attachCallSheet) callSheetPages else null,
            scheduleId = if (includeSched) latestSchedule?.id else null,
            primaryDay = if (includeSched) matched?.dayNumber else null,
            matchedDays = matchedDaysList
        )

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val res = ApiClient.apiService.generateSides(request)
                if (res.isSuccessful) {
                    Toast.makeText(requireContext(), "Sides generation started!", Toast.LENGTH_SHORT).show()
                    onSidesGenerated?.invoke()
                    dismiss()
                } else {
                    val err = res.errorBody()?.string() ?: "Request failed (${res.code()})"
                    Toast.makeText(requireContext(), err, Toast.LENGTH_LONG).show()
                    binding.btnSubmit.isEnabled = true
                    binding.btnSubmit.text = "Submit"
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Error: ${e.message}", Toast.LENGTH_LONG).show()
                binding.btnSubmit.isEnabled = true
                binding.btnSubmit.text = "Submit"
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
