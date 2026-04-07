package com.zillit.scriptdistribution.data.repository

import com.zillit.scriptdistribution.data.api.ApiClient
import com.zillit.scriptdistribution.data.models.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

class ScriptRepository {
    private val api = ApiClient.apiService

    suspend fun getMe() = api.getMe()

    suspend fun registerDevice(name: String) =
        api.registerDevice(mapOf("name" to name))

    suspend fun listScripts(page: Int = 1) = api.listScripts(page)

    suspend fun createScript(request: CreateScriptRequest) = api.createScript(request)

    suspend fun getScript(id: String) = api.getScript(id)

    suspend fun deleteScript(id: String) = api.deleteScript(id)

    suspend fun listVersions(scriptId: String) = api.listVersions(scriptId)

    suspend fun uploadVersion(
        scriptId: String,
        pdfFile: File,
        versionLabel: String? = null,
        changeNotes: String? = null
    ): retrofit2.Response<VersionResponse> {
        val pdfBody = pdfFile.asRequestBody("application/pdf".toMediaType())
        val pdfPart = MultipartBody.Part.createFormData("pdf", pdfFile.name, pdfBody)
        val labelBody = versionLabel?.toRequestBody("text/plain".toMediaType())
        val notesBody = changeNotes?.toRequestBody("text/plain".toMediaType())
        return api.uploadVersion(scriptId, pdfPart, labelBody, notesBody)
    }

    suspend fun downloadVersion(versionId: String) = api.downloadVersion(versionId)

    suspend fun triggerBreakdown(versionId: String, provider: String? = null) =
        api.triggerBreakdown(versionId, provider)

    suspend fun getBreakdown(versionId: String) = api.getBreakdown(versionId)

    suspend fun recordEvent(request: RecordEventRequest) = api.recordEvent(request)

    suspend fun getAnalytics(scriptId: String) = api.getAnalytics(scriptId)

    suspend fun getViewers(scriptId: String) = api.getViewers(scriptId)

    suspend fun getDownloads(scriptId: String) = api.getDownloads(scriptId)

    // Call Sheets
    suspend fun uploadCallSheet(
        pdfFile: File,
        title: String?,
        scriptId: String? = null
    ): retrofit2.Response<CallSheetUploadResponse> {
        val pdfBody = pdfFile.asRequestBody("application/pdf".toMediaType())
        val pdfPart = MultipartBody.Part.createFormData("pdf", pdfFile.name, pdfBody)
        val titleBody = title?.toRequestBody("text/plain".toMediaType())
        val scriptIdBody = scriptId?.toRequestBody("text/plain".toMediaType())
        return api.uploadCallSheet(pdfPart, titleBody, scriptIdBody)
    }

    suspend fun listCallSheets(scriptId: String? = null) = api.listCallSheets(scriptId)

    suspend fun getCallSheet(id: String) = api.getCallSheet(id)

    suspend fun deleteCallSheet(id: String) = api.deleteCallSheet(id)

    // Sides
    suspend fun generateSides(request: GenerateSidesRequest) = api.generateSides(request)

    suspend fun listSides(scriptId: String? = null) = api.listSides(scriptId)

    suspend fun getSides(id: String) = api.getSides(id)

    suspend fun downloadSides(id: String) = api.downloadSides(id)

    suspend fun deleteSides(id: String) = api.deleteSides(id)
}
