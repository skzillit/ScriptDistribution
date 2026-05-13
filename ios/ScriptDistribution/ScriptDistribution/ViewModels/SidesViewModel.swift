//
//  SidesViewModel.swift
//
//  Drives the Sides list screen (sides + call sheets tabs + download action).
//  All async work is performed off the main thread by URLSession; `@MainActor`
//  ensures @Published mutations land on main.
//

import Foundation
import UIKit

@MainActor
final class SidesViewModel: ObservableObject {

    enum Tab: Hashable { case sides, callSheets }

    @Published var sides: [Sides] = []
    @Published var callSheets: [CallSheet] = []
    @Published var tab: Tab = .sides
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var lastDownloadURL: URL?
    @Published var currentUser: User?

    private var realtimeListenerId: UUID?

    init() {
        // Refresh the list whenever the backend broadcasts a sides status change.
        realtimeListenerId = RealtimeManager.shared.addListener { [weak self] event, data in
            guard event == "sides:updated" else { return }
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                await self.reload()
                if let status = data["status"] as? String, status == "error",
                   let msg = data["error"] as? String {
                    self.errorMessage = "Sides failed: \(msg)"
                }
            }
        }
    }

    deinit {
        if let id = realtimeListenerId { RealtimeManager.shared.removeListener(id) }
    }

    /// Convenience for the empty-state text.
    var isCurrentTabEmpty: Bool {
        switch tab {
        case .sides:       return sides.isEmpty
        case .callSheets:  return callSheets.isEmpty
        }
    }

    /// `true` when the user can create new sides (admin / editor / unknown role).
    /// `false` for read-only viewer accounts — hides the Generate FAB.
    /// Default is permissive (true) so the UI doesn't disappear before /auth/me resolves.
    var canPost: Bool {
        guard let role = currentUser?.role?.lowercased(), !role.isEmpty else {
            return true
        }
        return role != "viewer"
    }

    func loadInitial() async {
        // Load current user in parallel with sides so the FAB visibility settles fast.
        async let userTask: () = loadCurrentUser()
        async let dataTask: () = reload()
        _ = await (userTask, dataTask)
    }

    /// Loads /api/auth/me — used to decide whether the Generate FAB is shown.
    func loadCurrentUser() async {
        do {
            let res = try await APIService.getMe()
            currentUser = res.user
        } catch {
            // Non-fatal — leave currentUser nil and fall through to permissive default.
        }
    }

    /// Reloads whichever tab is currently selected.
    func reload() async {
        switch tab {
        case .sides:      await loadSides()
        case .callSheets: await loadCallSheets()
        }
    }

    /// Loads /api/sides.
    func loadSides() async {
        loading = true
        errorMessage = nil
        do {
            let response = try await APIService.listSides(limit: 50)
            sides = response.sides
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }

    /// Loads /api/callsheets.
    func loadCallSheets() async {
        loading = true
        errorMessage = nil
        do {
            let response = try await APIService.listCallSheets(limit: 50)
            callSheets = response.callSheets
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }

    /// Fetches the signed download URL for a sides record and opens it externally.
    /// Mirrors Android's `Intent.ACTION_VIEW` behaviour.
    func download(id: String) async {
        do {
            let response = try await APIService.downloadSides(id: id)
            let absoluteURL: URL?
            if response.downloadUrl.hasPrefix("/") {
                absoluteURL = URL(string: "\(APIClient.baseURL)\(response.downloadUrl)")
            } else {
                absoluteURL = URL(string: response.downloadUrl)
            }
            if let url = absoluteURL {
                await UIApplication.shared.open(url)
                lastDownloadURL = url
            } else {
                errorMessage = "Invalid download URL"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Switch tabs and lazy-load the other list on first visit.
    func switchTab(to newTab: Tab) async {
        guard tab != newTab else { return }
        tab = newTab
        let isEmpty = (newTab == .sides && sides.isEmpty) || (newTab == .callSheets && callSheets.isEmpty)
        if isEmpty { await reload() }
    }
}
