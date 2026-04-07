package com.zillit.scriptdistribution.ui.scripts.detail

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zillit.scriptdistribution.data.models.Script
import com.zillit.scriptdistribution.data.models.ScriptVersion
import com.zillit.scriptdistribution.data.repository.ScriptRepository
import kotlinx.coroutines.launch

class ScriptDetailViewModel : ViewModel() {
    private val repo = ScriptRepository()

    private val _script = MutableLiveData<Script>()
    val script: LiveData<Script> = _script

    private val _versions = MutableLiveData<List<ScriptVersion>>()
    val versions: LiveData<List<ScriptVersion>> = _versions

    private val _loading = MutableLiveData(false)
    val loading: LiveData<Boolean> = _loading

    private val _downloadUrl = MutableLiveData<String?>()
    val downloadUrl: LiveData<String?> = _downloadUrl

    fun loadScript(id: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                val response = repo.getScript(id)
                if (response.isSuccessful) {
                    _script.value = response.body()?.script
                }
            } catch (e: Exception) {
                // Handle error
            } finally {
                _loading.value = false
            }
        }
    }

    fun loadVersions(scriptId: String) {
        viewModelScope.launch {
            try {
                val response = repo.listVersions(scriptId)
                if (response.isSuccessful) {
                    _versions.value = response.body()?.versions ?: emptyList()
                }
            } catch (_: Exception) { }
        }
    }

    fun triggerBreakdown(versionId: String) {
        viewModelScope.launch {
            try {
                repo.triggerBreakdown(versionId)
            } catch (_: Exception) { }
        }
    }

    fun downloadVersion(versionId: String) {
        viewModelScope.launch {
            try {
                val response = repo.downloadVersion(versionId)
                if (response.isSuccessful) {
                    _downloadUrl.value = response.body()?.downloadUrl
                }
            } catch (_: Exception) { }
        }
    }
}
