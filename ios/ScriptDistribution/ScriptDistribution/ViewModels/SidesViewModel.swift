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

    /// Convenience for the empty-state text.
    var isCurrentTabEmpty: Bool {
        switch tab {
        case .sides:       return sides.isEmpty
        case .callSheets:  return callSheets.isEmpty
        }
    }

    func loadInitial() async {
        await reload()
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
