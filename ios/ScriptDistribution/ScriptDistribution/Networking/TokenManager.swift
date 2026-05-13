//
//  TokenManager.swift
//
//  Persists a stable per-install device ID + optional userId in UserDefaults.
//  Mirrors Android's `TokenManager`. The device ID is auto-generated on first
//  launch (UUID-based) and never changes for the install lifetime.
//

import Foundation
import UIKit

enum TokenManager {

    private static let keyDeviceId = "scriptdistribution.deviceId"
    private static let keyUserId   = "scriptdistribution.userId"
    private static let keyUserName = "scriptdistribution.userName"

    /// Returns the stable device ID, generating one on first access.
    static func getDeviceId() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: keyDeviceId), !existing.isEmpty {
            return existing
        }
        // Prefer iOS identifierForVendor (stable per app install + vendor),
        // fall back to a random UUID if unavailable.
        let id = UIDevice.current.identifierForVendor?.uuidString
            ?? "ios-\(UUID().uuidString)"
        defaults.set(id, forKey: keyDeviceId)
        return id
    }

    static func getUserId() -> String {
        UserDefaults.standard.string(forKey: keyUserId) ?? ""
    }

    static func setUserId(_ id: String) {
        UserDefaults.standard.set(id, forKey: keyUserId)
    }

    static func getUserName() -> String {
        UserDefaults.standard.string(forKey: keyUserName) ?? ""
    }

    static func setUserName(_ name: String) {
        UserDefaults.standard.set(name, forKey: keyUserName)
    }

    static var isLoggedIn: Bool { !getUserId().isEmpty }

    /// `"{model}|{systemVersion}|iOS"` — matches Android's `deviceInfo` shape.
    static func deviceInfoHeader() -> String {
        let device = UIDevice.current
        return "\(device.model)|\(device.systemVersion)|iOS"
    }
}
