package com.zillit.scriptdistribution.ui.scripts.upload

import android.content.Context
import android.net.Uri
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zillit.scriptdistribution.data.models.CreateScriptRequest
import com.zillit.scriptdistribution.data.repository.ScriptRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class UploadScriptViewModel : ViewModel() {
    private val repo = ScriptRepository()

    private val _uploadProgress = MutableLiveData(0)
    val uploadProgress: LiveData<Int> = _uploadProgress

    private val _scriptId = MutableLiveData<String?>()
    val scriptId: LiveData<String?> = _scriptId

    private val _loading = MutableLiveData(false)
    val loading: LiveData<Boolean> = _loading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    fun uploadScript(context: Context, uri: Uri, title: String, description: String) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                // Create script
                val createResponse = repo.createScript(CreateScriptRequest(title, description))
                if (!createResponse.isSuccessful) {
                    _error.value = "Failed to create script"
                    return@launch
                }
                val script = createResponse.body()?.script ?: return@launch
                _uploadProgress.value = 10

                // Copy URI to temp file
                val tempFile = withContext(Dispatchers.IO) {
                    val file = File(context.cacheDir, "upload_${System.currentTimeMillis()}.pdf")
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        file.outputStream().use { output -> input.copyTo(output) }
                    }
                    file
                }
                _uploadProgress.value = 30

                // Upload version
                val versionResponse = repo.uploadVersion(script.id, tempFile)
                _uploadProgress.value = 90

                if (versionResponse.isSuccessful) {
                    _uploadProgress.value = 100
                    _scriptId.value = script.id
                } else {
                    _error.value = "Version upload failed"
                }

                // Cleanup
                tempFile.delete()
            } catch (e: Exception) {
                _error.value = e.message ?: "Upload failed"
            } finally {
                _loading.value = false
            }
        }
    }
}
