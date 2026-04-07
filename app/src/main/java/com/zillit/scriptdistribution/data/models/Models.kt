package com.zillit.scriptdistribution.data.models

import com.google.gson.annotations.SerializedName

// User
data class User(
    @SerializedName("_id") val id: String,
    val name: String,
    val email: String?,
    val role: String?,
    val deviceId: String?,
    val avatarUrl: String?
)

// Script
data class Script(
    @SerializedName("_id") val id: String,
    val title: String,
    val description: String?,
    val owner: User?,
    val currentVersion: ScriptVersion?,
    val genre: String?,
    val format: String?,
    val status: String?,
    val tags: List<String>?,
    val createdAt: String?,
    val updatedAt: String?
)

// Script Version
data class ScriptVersion(
    @SerializedName("_id") val id: String,
    val script: String?,
    val versionNumber: Int,
    val versionLabel: String?,
    val pageCount: Int?,
    val uploadedBy: User?,
    val changeNotes: String?,
    val status: String?,
    val createdAt: String?
)

// Breakdown
data class Breakdown(
    @SerializedName("_id") val id: String,
    val scriptVersion: String?,
    val status: String,
    val elements: List<BreakdownElement>?,
    val scenes: List<Scene>?,
    val summary: BreakdownSummary?,
    val aiProvider: String?,
    val error: String?
)

data class BreakdownElement(
    @SerializedName("_id") val id: String?,
    val category: String,
    val name: String,
    val description: String?,
    val occurrences: List<Occurrence>?,
    val color: String?
)

data class Occurrence(
    val pageNumber: Int?,
    val sceneNumber: String?,
    val startOffset: Int?,
    val endOffset: Int?,
    val contextSnippet: String?
)

data class Scene(
    val sceneNumber: String?,
    val heading: String?,
    val intExt: String?,
    val location: String?,
    val timeOfDay: String?,
    val pageStart: Int?,
    val pageEnd: Int?,
    val synopsis: String?
)

data class BreakdownSummary(
    val totalScenes: Int?,
    val totalPages: Int?,
    val castCount: Int?,
    val locationCount: Int?,
    val estimatedShootDays: Int?
)

// Analytics
data class AnalyticsSummary(
    val totalViews: Int,
    val totalDownloads: Int,
    val uniqueViewers: Int
)

data class Viewer(
    val user: User?,
    val viewCount: Int,
    val lastViewed: String?
)

data class DownloadEvent(
    val user: User?,
    val scriptVersion: ScriptVersion?,
    val createdAt: String?
)

// Call Sheet
data class CallSheetScene(
    val sceneNumber: String,
    val description: String?,
    val location: String?,
    val timeOfDay: String?,
    val cast: List<String>?,
    val notes: String?
)

data class CallSheet(
    @SerializedName("_id") val id: String,
    val title: String,
    val project: Script?,
    val uploadedBy: User?,
    val date: String?,
    val scenes: List<CallSheetScene>?,
    val crewCall: String?,
    val location: String?,
    val weather: String?,
    val notes: String?,
    val status: String?,
    val createdAt: String?
)

// Sides
data class SidesScene(
    val sceneNumber: String,
    val heading: String?,
    val rawText: String?,
    val pageStart: Int?,
    val pageEnd: Int?
)

data class Sides(
    @SerializedName("_id") val id: String,
    val callSheet: CallSheet?,
    val scriptVersion: ScriptVersion?,
    val script: Script?,
    val title: String,
    val sceneNumbers: List<String>?,
    val scenes: List<SidesScene>?,
    val totalScenes: Int?,
    val pdfUrl: String?,
    val downloadCount: Int?,
    val status: String,
    val error: String?,
    val createdAt: String?
)

// API Requests
data class GenerateSidesRequest(
    val callSheetId: String? = null,
    val scriptId: String,
    val versionId: String? = null,
    val sceneNumbers: String? = null,
    val title: String? = null,
    val mode: String? = "manual" // "manual" or "ai"
)

data class CreateScriptRequest(
    val title: String,
    val description: String? = null,
    val format: String = "feature",
    val genre: String? = null
)

data class RecordEventRequest(
    val scriptId: String,
    val versionId: String? = null,
    val eventType: String,
    val metadata: Map<String, Any>? = null
)

// API Responses
data class UserResponse(val user: User)
data class ScriptResponse(val script: Script)
data class ScriptsListResponse(val scripts: List<Script>, val total: Int, val page: Int)
data class VersionResponse(val version: ScriptVersion)
data class VersionsListResponse(val versions: List<ScriptVersion>)
data class BreakdownResponse(val breakdown: Breakdown, val message: String?)
data class DownloadResponse(val downloadUrl: String)
data class SuccessResponse(val success: Boolean)
data class AnalyticsResponse(val events: List<Any>, val summary: AnalyticsSummary)
data class ViewersResponse(val viewers: List<Viewer>)
data class DownloadsResponse(val downloads: List<DownloadEvent>, val total: Int)
data class CallSheetUploadResponse(val callSheet: CallSheet, val extractedSceneNumbers: List<String>, val sceneCount: Int)
data class CallSheetsListResponse(val callSheets: List<CallSheet>, val total: Int)
data class CallSheetDetailResponse(val callSheet: CallSheet)
data class SidesResponse(val sides: Sides)
data class SidesListResponse(val sides: List<Sides>, val total: Int)
data class SidesDownloadResponse(val downloadUrl: String, val downloadCount: Int)
