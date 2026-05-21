//
//  Models.swift
//  ScriptDistribution
//
//  Codable structs mirroring Android `Models.kt` field-by-field.
//  The backend returns Mongo `_id` which we map to Swift `id` via CodingKeys.
//

import Foundation

// MARK: - User

struct User: Codable, Identifiable {
    let id: String
    let name: String
    let email: String?
    let role: String?
    let deviceId: String?
    let avatarUrl: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, email, role, deviceId, avatarUrl
    }
}

// MARK: - Script + Version

struct Script: Codable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let owner: User?
    let currentVersion: ScriptVersion?
    let genre: String?
    let format: String?
    let status: String?
    let tags: [String]?
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title, description, owner, currentVersion, genre, format, status, tags, createdAt, updatedAt
    }
}

struct ScriptVersion: Codable, Identifiable {
    let id: String
    let script: String?
    let versionNumber: Int
    let versionLabel: String?
    let pageCount: Int?
    let uploadedBy: User?
    let changeNotes: String?
    let status: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case script, versionNumber, versionLabel, pageCount, uploadedBy, changeNotes, status, createdAt
    }
}

// MARK: - Call Sheet

struct CallSheetScene: Codable, Hashable {
    let sceneNumber: String
    let description: String?
    let location: String?
    let timeOfDay: String?
    let cast: [String]?
    let notes: String?
}

struct CallSheet: Codable, Identifiable {
    let id: String
    let title: String
    let project: Script?
    let uploadedBy: User?
    let date: String?
    let scenes: [CallSheetScene]?
    let crewCall: String?
    let location: String?
    let weather: String?
    let notes: String?
    let status: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title, project, uploadedBy, date, scenes, crewCall, location, weather, notes, status, createdAt
    }
}

// MARK: - Shooting Schedule

struct ShootDayScene: Codable, Hashable {
    let sceneNumber: String?
    let heading: String?
    let intExt: String?
    let location: String?
    let timeOfDay: String?
    let pages: String?
    let synopsis: String?
}

struct ShootDay: Codable, Hashable {
    let dayNumber: Int?
    let date: String?
    let callTime: String?
    let wrapTime: String?
    let location: String?
    let scenes: [ShootDayScene]?
    let notes: String?
}

struct ShootingSchedule: Codable, Identifiable {
    let id: String
    let title: String
    let pdfUrl: String?
    let shootDays: [ShootDay]?
    let totalDays: Int?
    let totalScenes: Int?
    let startDate: String?
    let endDate: String?
    let status: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title, pdfUrl, shootDays, totalDays, totalScenes, startDate, endDate, status, createdAt
    }
}

// MARK: - Sides

struct SidesScene: Codable, Hashable {
    let sceneNumber: String
    let heading: String?
    let rawText: String?
    let pageStart: Int?
    let pageEnd: Int?
}

struct Sides: Codable, Identifiable {
    let id: String
    let callSheet: CallSheet?
    let scriptVersion: ScriptVersion?
    let script: Script?
    let title: String
    let sceneNumbers: [String]?
    let scenes: [SidesScene]?
    let totalScenes: Int?
    let pdfUrl: String?
    let downloadCount: Int?
    let status: String
    let error: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case callSheet, scriptVersion, script, title, sceneNumbers, scenes
        case totalScenes, pdfUrl, downloadCount, status, error, createdAt
    }
}

// MARK: - Generate Sides Request

struct GenerateSidesRequest: Codable {
    let scriptId: String
    let callSheetId: String?
    let versionId: String?
    let sceneNumbers: String?
    let title: String?
    let mode: String?
    let includeCallSheet: Bool?
    let includeCallSheetScenes: Bool? // false = custom scenes only
    let callSheetPages: String?
    let scheduleId: String?
    let primaryDay: Int?
    let matchedDays: [Int]?
}

// MARK: - Response Wrappers

struct ActiveScriptResponse: Codable { let script: Script? }
struct ScriptResponse: Codable { let script: Script }
struct CallSheetsListResponse: Codable { let callSheets: [CallSheet]; let total: Int }
struct CallSheetDetailResponse: Codable { let callSheet: CallSheet }
struct SchedulesListResponse: Codable { let schedules: [ShootingSchedule]; let total: Int }
struct ScheduleDetailResponse: Codable { let schedule: ShootingSchedule }
struct SidesListResponse: Codable { let sides: [Sides]; let total: Int }
struct SidesResponse: Codable { let sides: Sides }
struct SidesDownloadResponse: Codable { let downloadUrl: String; let downloadCount: Int }
struct UserResponse: Codable { let user: User }
struct SuccessResponse: Codable { let success: Bool }
