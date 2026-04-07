package com.zillit.scriptdistribution.ui.analytics

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zillit.scriptdistribution.data.models.AnalyticsSummary
import com.zillit.scriptdistribution.data.repository.ScriptRepository
import kotlinx.coroutines.launch

class AnalyticsViewModel : ViewModel() {
    private val repo = ScriptRepository()

    private val _summary = MutableLiveData<AnalyticsSummary>()
    val summary: LiveData<AnalyticsSummary> = _summary

    private val _loading = MutableLiveData(false)
    val loading: LiveData<Boolean> = _loading

    fun loadAnalytics(scriptId: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                val response = repo.getAnalytics(scriptId)
                if (response.isSuccessful) {
                    _summary.value = response.body()?.summary
                }
            } catch (_: Exception) { }
            _loading.value = false
        }
    }
}
