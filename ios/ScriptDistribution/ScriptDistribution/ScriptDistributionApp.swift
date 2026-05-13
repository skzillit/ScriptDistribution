//
//  ScriptDistributionApp.swift
//
//  @main app entry — single window, single root view.
//

import SwiftUI

@main
struct ScriptDistributionApp: App {
    init() {
        // Touch TokenManager once at launch so the device ID is generated
        // (and persisted) before the first network request fires.
        _ = TokenManager.getDeviceId()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
