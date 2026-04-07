package com.zillit.scriptdistribution.ui.sides

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zillit.scriptdistribution.data.models.*
import com.zillit.scriptdistribution.data.repository.ScriptRepository
import kotlinx.coroutines.launch

class SidesViewModel : ViewModel() {
    private val repo = ScriptRepository()

    private val _sidesList = MutableLiveData<List<Sides>>()
    val sidesList: LiveData<List<Sides>> = _sidesList

    private val _callSheets = MutableLiveData<List<CallSheet>>()
    val callSheets: LiveData<List<CallSheet>> = _callSheets

    private val _loading = MutableLiveData(false)
    val loading: LiveData<Boolean> = _loading

    private val _downloadUrl = MutableLiveData<String?>()
    val downloadUrl: LiveData<String?> = _downloadUrl

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    fun loadSides() {
        viewModelScope.launch {
            _loading.value = true
            try {
                val response = repo.listSides()
                if (response.isSuccessful) {
                    _sidesList.value = response.body()?.sides ?: emptyList()
                }
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _loading.value = false
            }
        }
    }

    fun loadCallSheets() {
        viewModelScope.launch {
            try {
                val response = repo.listCallSheets()
                if (response.isSuccessful) {
                    _callSheets.value = response.body()?.callSheets ?: emptyList()
                }
            } catch (_: Exception) { }
        }
    }

    fun generateSides(request: GenerateSidesRequest) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val response = repo.generateSides(request)
                if (response.isSuccessful) {
                    loadSides() // Refresh list
                } else {
                    _error.value = "Failed to generate sides"
                }
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _loading.value = false
            }
        }
    }

    fun downloadSides(sidesId: String) {
        viewModelScope.launch {
            try {
                val response = repo.downloadSides(sidesId)
                if (response.isSuccessful) {
                    _downloadUrl.value = response.body()?.downloadUrl
                }
            } catch (_: Exception) { }
        }
    }

    fun deleteSides(sidesId: String) {
        viewModelScope.launch {
            try {
                repo.deleteSides(sidesId)
                loadSides()
            } catch (_: Exception) { }
        }
    }
}
