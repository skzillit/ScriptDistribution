package com.zillit.scriptdistribution.data.api

import com.zillit.scriptdistribution.data.models.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    // Auth
    @GET("auth/me")
    suspend fun getMe(): Response<UserResponse>

    @POST("auth/register-device")
    suspend fun registerDevice(@Body body: Map<String, String>): Response<UserResponse>

    // Scripts
    @GET("scripts")
    suspend fun listScripts(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ScriptsListResponse>

    @POST("scripts")
    suspend fun createScript(@Body body: CreateScriptRequest): Response<ScriptResponse>

    @GET("scripts/{id}")
    suspend fun getScript(@Path("id") id: String): Response<ScriptResponse>

    @PUT("scripts/{id}")
    suspend fun updateScript(@Path("id") id: String, @Body body: Map<String, String>): Response<ScriptResponse>

    @DELETE("scripts/{id}")
    suspend fun deleteScript(@Path("id") id: String): Response<SuccessResponse>

    // Versions
    @GET("scripts/{scriptId}/versions")
    suspend fun listVersions(@Path("scriptId") scriptId: String): Response<VersionsListResponse>

    @Multipart
    @POST("scripts/{scriptId}/versions")
    suspend fun uploadVersion(
        @Path("scriptId") scriptId: String,
        @Part pdf: MultipartBody.Part,
        @Part("versionLabel") versionLabel: RequestBody?,
        @Part("changeNotes") changeNotes: RequestBody?
    ): Response<VersionResponse>

    @GET("versions/{versionId}")
    suspend fun getVersion(@Path("versionId") versionId: String): Response<VersionResponse>

    @GET("versions/{versionId}/download")
    suspend fun downloadVersion(@Path("versionId") versionId: String): Response<DownloadResponse>

    // Breakdown
    @POST("versions/{versionId}/breakdown")
    suspend fun triggerBreakdown(
        @Path("versionId") versionId: String,
        @Query("provider") provider: String? = null
    ): Response<BreakdownResponse>

    @GET("versions/{versionId}/breakdown")
    suspend fun getBreakdown(@Path("versionId") versionId: String): Response<BreakdownResponse>

    // Analytics
    @POST("analytics/event")
    suspend fun recordEvent(@Body body: RecordEventRequest): Response<SuccessResponse>

    @GET("analytics/scripts/{scriptId}")
    suspend fun getAnalytics(@Path("scriptId") scriptId: String): Response<AnalyticsResponse>

    @GET("analytics/scripts/{scriptId}/viewers")
    suspend fun getViewers(@Path("scriptId") scriptId: String): Response<ViewersResponse>

    @GET("analytics/scripts/{scriptId}/downloads")
    suspend fun getDownloads(@Path("scriptId") scriptId: String): Response<DownloadsResponse>

    // Call Sheets
    @Multipart
    @POST("callsheets")
    suspend fun uploadCallSheet(
        @Part pdf: MultipartBody.Part,
        @Part("title") title: RequestBody?,
        @Part("scriptId") scriptId: RequestBody?
    ): Response<CallSheetUploadResponse>

    @GET("callsheets")
    suspend fun listCallSheets(
        @Query("scriptId") scriptId: String? = null,
        @Query("limit") limit: Int = 50
    ): Response<CallSheetsListResponse>

    @GET("callsheets/{id}")
    suspend fun getCallSheet(@Path("id") id: String): Response<CallSheetDetailResponse>

    @DELETE("callsheets/{id}")
    suspend fun deleteCallSheet(@Path("id") id: String): Response<SuccessResponse>

    // Sides
    @POST("sides")
    suspend fun generateSides(@Body body: GenerateSidesRequest): Response<SidesResponse>

    @GET("sides")
    suspend fun listSides(
        @Query("scriptId") scriptId: String? = null,
        @Query("limit") limit: Int = 50
    ): Response<SidesListResponse>

    @GET("sides/{id}")
    suspend fun getSides(@Path("id") id: String): Response<SidesResponse>

    @GET("sides/{id}/download")
    suspend fun downloadSides(@Path("id") id: String): Response<SidesDownloadResponse>

    @DELETE("sides/{id}")
    suspend fun deleteSides(@Path("id") id: String): Response<SuccessResponse>
}
