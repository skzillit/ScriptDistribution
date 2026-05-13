//
//  SidesListView.swift
//
//  Top-level Sides screen — segmented Sides / Call Sheets tabs, pull-to-refresh,
//  floating "+" button to open the Generate Sides bottom sheet, and per-item
//  View / Download actions.
//

import SwiftUI

struct SidesListView: View {

    @StateObject private var vm = SidesViewModel()
    @State private var showGenerate = false
    @State private var activeViewSides: Sides?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(spacing: 0) {
                tabSelector
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 12)

                if vm.loading && vm.isCurrentTabEmpty {
                    ProgressView().padding(.top, 40)
                    Spacer()
                } else if vm.isCurrentTabEmpty {
                    emptyState
                } else {
                    list
                }
            }
            generateFAB
        }
        .navigationTitle("Sides")
        .navigationBarTitleDisplayMode(.large)
        .task { await vm.loadInitial() }
        .refreshable { await vm.reload() }
        .sheet(isPresented: $showGenerate) {
            GenerateSidesSheet(onCompleted: {
                Task { await vm.loadSides() }
            })
        }
        .navigationDestination(item: $activeViewSides) { sides in
            if let url = APIService.sidesViewURL(id: sides.id) {
                SidesWebViewScreen(title: sides.title, url: url)
            } else {
                Text("Invalid URL")
            }
        }
        .alert("Error", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: - Subviews

    private var tabSelector: some View {
        Picker("Tab", selection: Binding(
            get: { vm.tab },
            set: { newValue in Task { await vm.switchTab(to: newValue) } }
        )) {
            Text("Sides").tag(SidesViewModel.Tab.sides)
            Text("Call Sheets").tag(SidesViewModel.Tab.callSheets)
        }
        .pickerStyle(.segmented)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: vm.tab == .sides ? "doc.on.doc" : "doc.text")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text(vm.tab == .sides ? "No sides yet" : "No call sheets yet")
                .font(.headline)
                .foregroundColor(.secondary)
            Text(vm.tab == .sides
                 ? "Tap + to generate sides from a call sheet."
                 : "Upload a call sheet via the web app to see it here.")
                .font(.footnote)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                switch vm.tab {
                case .sides:
                    ForEach(vm.sides) { sides in
                        SidesItemRow(
                            sides: sides,
                            onView: { activeViewSides = sides },
                            onDownload: { Task { await vm.download(id: sides.id) } }
                        )
                    }
                case .callSheets:
                    ForEach(vm.callSheets) { cs in
                        CallSheetRow(callSheet: cs)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 100) // leave room for the FAB
        }
    }

    private var generateFAB: some View {
        Button { showGenerate = true } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 56, height: 56)
                .background(Color.accentColor)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.2), radius: 6, x: 0, y: 3)
        }
        .padding(.trailing, 20)
        .padding(.bottom, 24)
        .accessibilityLabel("Generate sides")
    }
}
