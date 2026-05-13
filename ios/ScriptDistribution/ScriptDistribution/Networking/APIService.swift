//
//  APIService.swift
//
//  Typed wrappers over `APIClient` for every endpoint the Sides screen needs.
//  Mirrors the Android `ApiService` interface.
//

import Foundation

enum APIService {

    // MARK: - Scripts

    static func getActiveScript() async throws -> ActiveScriptResponse {
        try await APIClient.get("/api/scripts/active")
    }

    static func getScriptScenes(versionId: String) async throws -> ScriptScenesResponse {
        try await APIClient.get("/api/versions/\(versionId)/scenes")
    }

    // MARK: - Call sheets

    static func listCallSheets(limit: Int = 100) async throws -> CallSheetsListResponse {
        try await APIClient.get("/api/callsheets?limit=\(limit)")
    }

    static func getCallSheet(id: String) async throws -> CallSheetDetailResponse {
        try await APIClient.get("/api/callsheets/\(id)")
    }

    // MARK: - Schedules

    static func listSchedules(limit: Int = 100) async throws -> SchedulesListResponse {
        try await APIClient.get("/api/schedules?limit=\(limit)")
    }

    static func getSchedule(id: String) async throws -> ScheduleDetailResponse {
        try await APIClient.get("/api/schedules/\(id)")
    }

    // MARK: - Sides

    static func listSides(limit: Int = 50) async throws -> SidesListResponse {
        try await APIClient.get("/api/sides?limit=\(limit)")
    }

    static func generateSides(_ req: GenerateSidesRequest) async throws -> SidesResponse {
        try await APIClient.post("/api/sides", body: req)
    }

    static func downloadSides(id: String) async throws -> SidesDownloadResponse {
        try await APIClient.get("/api/sides/\(id)/download")
    }

    static func deleteSides(id: String) async throws -> SuccessResponse {
        try await APIClient.delete("/api/sides/\(id)")
    }

    // MARK: - URL helpers

    /// URL of the in-app sides view page (rendered as HTML by the backend with
    /// embedded pdf.js). Loaded by `SidesWebView` with auth headers attached.
    static func sidesViewURL(id: String) -> URL? {
        URL(string: "\(APIClient.baseURL)/api/sides/\(id)/view")
    }
}

// MARK: - Helpers for endpoints not in the original Android port but referenced by GenerateSidesRequest

struct ScriptSceneInfo: Codable {
    let sceneNumber: String
    let heading: String?
    let intExt: String?
    let location: String?
    let timeOfDay: String?
    let pageStart: Int?
    let pageEnd: Int?
}
struct ScriptScenesResponse: Codable {
    let versionId: String
    let totalScenes: Int
    let scenes: [ScriptSceneInfo]
}
