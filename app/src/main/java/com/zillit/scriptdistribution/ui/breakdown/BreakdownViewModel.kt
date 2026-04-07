package com.zillit.scriptdistribution.ui.breakdown

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zillit.scriptdistribution.data.models.Breakdown
import com.zillit.scriptdistribution.data.repository.ScriptRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class BreakdownViewModel : ViewModel() {
    private val repo = ScriptRepository()

    private val _breakdown = MutableLiveData<Breakdown?>()
    val breakdown: LiveData<Breakdown?> = _breakdown

    fun loadBreakdown(versionId: String) {
        viewModelScope.launch {
            while (true) {
                try {
                    val response = repo.getBreakdown(versionId)
                    if (response.isSuccessful) {
                        val bd = response.body()?.breakdown
                        _breakdown.value = bd
                        if (bd?.status == "complete" || bd?.status == "error") break
                    }
                } catch (_: Exception) { }
                delay(3000)
            }
        }
    }
}
