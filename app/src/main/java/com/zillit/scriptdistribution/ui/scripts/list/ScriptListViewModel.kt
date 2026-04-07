package com.zillit.scriptdistribution.ui.scripts.list

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zillit.scriptdistribution.data.models.Script
import com.zillit.scriptdistribution.data.repository.ScriptRepository
import kotlinx.coroutines.launch

class ScriptListViewModel : ViewModel() {
    private val repo = ScriptRepository()

    private val _scripts = MutableLiveData<List<Script>>()
    val scripts: LiveData<List<Script>> = _scripts

    private val _loading = MutableLiveData(false)
    val loading: LiveData<Boolean> = _loading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    init {
        loadScripts()
    }

    fun loadScripts() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val response = repo.listScripts()
                if (response.isSuccessful) {
                    _scripts.value = response.body()?.scripts ?: emptyList()
                } else {
                    _error.value = "Failed to load scripts"
                }
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _loading.value = false
            }
        }
    }
}
