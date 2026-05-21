//
//  GenerateSidesSheet.swift
//
//  Bottom-sheet "Customize Sides" form — mirrors Android's `GenerateSidesDialog`.
//
//  Flow:
//    1. Auto-load active script (read-only display)
//    2. Auto-load latest call sheet (draft preferred) + its scenes
//    3. Auto-load latest schedule (draft preferred)
//    4. Compute matched shoot day (highest scene overlap) + extra scenes
//    5. User picks call-sheet pages, toggles include-schedule, adds manual scenes,
//       optionally types a title
//    6. Submit posts a `GenerateSidesRequest` identical to the web/android payload
//

import SwiftUI

@MainActor
private final class GenerateSidesViewModel: ObservableObject {

    @Published var activeScript: Script?
    @Published var latestCallSheet: CallSheet?
    @Published var latestSchedule: ShootingSchedule?

    @Published var loading = true
    @Published var errorMessage: String?
    @Published var submitting = false

    // Form state
    @Published var callSheetPages: String = "all"
    @Published var includeSchedule: Bool = false
    /// Seed the scene list from the call sheet. When false → custom scenes only.
    @Published var useCallSheetScenes: Bool = true
    /// Attach the call sheet PDF page(s) to the generated sides.
    @Published var includeCallSheet: Bool = true
    @Published var manualScenes: String = ""
    @Published var title: String = ""

    // Derived
    @Published var matchedDay: ShootDay?
    @Published var matchedSceneNumbers: [String] = []
    @Published var extraScenes: [ExtraScene] = []

    struct ExtraScene: Hashable, Identifiable {
        let sceneNumber: String
        let day: ShootDay
        var id: String { sceneNumber }
    }

    var canSubmit: Bool {
        activeScript != nil && !finalSceneNumbers.isEmpty && !submitting
    }

    /// Final list of scene numbers (call sheet + manual, deduplicated, ordered).
    var finalSceneNumbers: [String] {
        var seen = Set<String>()
        var out: [String] = []
        // Call sheet scenes — only when the user opted to use them
        if useCallSheetScenes, let cs = latestCallSheet?.scenes {
            for s in cs {
                if !seen.contains(s.sceneNumber) {
                    seen.insert(s.sceneNumber)
                    out.append(s.sceneNumber)
                }
            }
        }
        if !manualScenes.isEmpty {
            let tokens = manualScenes.split(whereSeparator: { ",; \t\n".contains($0) })
            for token in tokens {
                let t = String(token)
                if !t.isEmpty && !seen.contains(t) {
                    seen.insert(t)
                    out.append(t)
                }
            }
        }
        return out
    }

    func load() async {
        loading = true
        errorMessage = nil

        async let scriptTask = APIService.getActiveScript()
        async let callSheetsTask = APIService.listCallSheets(limit: 100)
        async let schedulesTask = APIService.listSchedules(limit: 100)

        do {
            let (script, cs, sched) = try await (scriptTask, callSheetsTask, schedulesTask)
            activeScript = script.script

            // Pick latest draft, else first
            if let draft = cs.callSheets.first(where: { $0.status == "draft" }) ?? cs.callSheets.first {
                // Fetch full detail with scenes
                if let detail = try? await APIService.getCallSheet(id: draft.id) {
                    latestCallSheet = detail.callSheet
                } else {
                    latestCallSheet = draft
                }
            }

            if let draft = sched.schedules.first(where: { $0.status == "draft" }) ?? sched.schedules.first {
                if let detail = try? await APIService.getSchedule(id: draft.id) {
                    latestSchedule = detail.schedule
                } else {
                    latestSchedule = draft
                }
            }

            computeMatchedShootDay()
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }

    /// Find the shoot day with the highest scene overlap with the call sheet.
    /// Ported verbatim from Android's `GenerateSidesDialog.computeMatchedShootDay`.
    func computeMatchedShootDay() {
        guard let sc = latestSchedule else { return }
        matchedDay = nil
        matchedSceneNumbers = []
        extraScenes = []
        // Match against call sheet scenes normally, or the custom scene list
        // when "use scenes from call sheet" is turned off.
        let csNums: Set<String> = useCallSheetScenes
            ? Set((latestCallSheet?.scenes ?? []).map { $0.sceneNumber.uppercased() })
            : Set(finalSceneNumbers.map { $0.uppercased() })
        guard !csNums.isEmpty else { return }

        var bestDay: ShootDay?
        var bestOverlap: [String] = []
        for day in sc.shootDays ?? [] {
            let overlap = (day.scenes ?? [])
                .compactMap { $0.sceneNumber?.uppercased() }
                .filter { csNums.contains($0) }
            if overlap.count > bestOverlap.count {
                bestOverlap = overlap
                bestDay = day
            }
        }
        matchedDay = bestDay
        matchedSceneNumbers = bestOverlap

        // Extras: call sheet scenes NOT in best day → find which other day has them
        if bestDay != nil {
            let matchedSet = Set(bestOverlap)
            let notInBestDay = csNums.subtracting(matchedSet)
            var extras: [ExtraScene] = []
            for sn in notInBestDay {
                if let day = (sc.shootDays ?? []).first(where: { day in
                    (day.scenes ?? []).contains(where: { $0.sceneNumber?.uppercased() == sn })
                }) {
                    extras.append(ExtraScene(sceneNumber: sn, day: day))
                }
            }
            extraScenes = extras
        }
    }

    func submit() async -> Bool {
        guard let script = activeScript else {
            errorMessage = "No active script"
            return false
        }
        submitting = true
        errorMessage = nil

        let includeSched = includeSchedule && matchedDay != nil
        let matchedDays: [Int]? = {
            guard includeSched, let match = matchedDay else { return nil }
            var days = Set<Int>()
            if let d = match.dayNumber { days.insert(d) }
            for ex in extraScenes {
                if let d = ex.day.dayNumber { days.insert(d) }
            }
            return Array(days)
        }()

        let attachCallSheet = latestCallSheet != nil && includeCallSheet

        let req = GenerateSidesRequest(
            scriptId: script.id,
            callSheetId: latestCallSheet?.id,
            versionId: nil,
            sceneNumbers: finalSceneNumbers.joined(separator: ", "),
            title: title.isEmpty ? nil : title,
            mode: "manual",
            includeCallSheet: attachCallSheet,
            includeCallSheetScenes: useCallSheetScenes,
            callSheetPages: attachCallSheet ? callSheetPages : nil,
            scheduleId: includeSched ? latestSchedule?.id : nil,
            primaryDay: includeSched ? matchedDay?.dayNumber : nil,
            matchedDays: matchedDays
        )

        do {
            _ = try await APIService.generateSides(req)
            submitting = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            submitting = false
            return false
        }
    }
}

// MARK: - View

struct GenerateSidesSheet: View {

    let onCompleted: () -> Void
    @StateObject private var vm = GenerateSidesViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if vm.loading {
                        ProgressView("Loading…")
                            .frame(maxWidth: .infinity)
                            .padding(.top, 60)
                    } else {
                        scriptCard
                        callSheetSection
                        scheduleSection
                        matchedDaySection
                        manualScenesSection
                        summaryCard
                        titleSection
                    }
                }
                .padding(20)
            }
            .navigationTitle("Customize Sides")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: submit) {
                        if vm.submitting { ProgressView() } else { Text("Submit") }
                    }
                    .disabled(!vm.canSubmit)
                }
            }
            .task { await vm.load() }
            .alert("Error", isPresented: Binding(
                get: { vm.errorMessage != nil },
                set: { if !$0 { vm.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { vm.errorMessage = nil }
            } message: {
                Text(vm.errorMessage ?? "")
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Sections

    private var scriptCard: some View {
        InfoCard(emoji: "📜",
                 title: vm.activeScript?.title ?? "No active script",
                 subtitle: scriptSubtitle)
    }

    private var scriptSubtitle: String {
        guard let v = vm.activeScript?.currentVersion else { return "Upload a script first" }
        var parts: [String] = []
        if let label = v.versionLabel { parts.append(label) }
        else if v.versionNumber > 0 { parts.append("v\(v.versionNumber)") }
        if let p = v.pageCount { parts.append("\(p) pages") }
        return parts.joined(separator: " · ")
    }

    private var callSheetSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let cs = vm.latestCallSheet {
                InfoCard(emoji: "📋", title: cs.title, subtitle: callSheetSubtitle(cs))

                HStack(spacing: 8) {
                    Text("Include pages:")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Picker("Pages", selection: $vm.callSheetPages) {
                        Text("All").tag("all")
                        Text("1").tag("1")
                        Text("2").tag("2")
                        Text("3").tag("3")
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 240)
                }

                if let scenes = cs.scenes, !scenes.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("CALL SHEET SCENES")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.secondary)
                        ChipRow(items: scenes.map(\.sceneNumber))
                    }
                    .padding(10)
                    .background(Color(.tertiarySystemBackground))
                    .cornerRadius(8)
                    .opacity(vm.useCallSheetScenes ? 1 : 0.5)
                }

                // Call sheet options
                Toggle(isOn: $vm.useCallSheetScenes) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Use scenes from call sheet").font(.system(size: 13))
                        if !vm.useCallSheetScenes {
                            Text("Custom scenes only").font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }
                }
                .onChange(of: vm.useCallSheetScenes) { _ in vm.computeMatchedShootDay() }

                Toggle("Attach call sheet to sides PDF", isOn: $vm.includeCallSheet)
                    .font(.system(size: 13))
            } else {
                InfoCard(emoji: "📋", title: "No call sheet uploaded", subtitle: nil)
            }
        }
    }

    private func callSheetSubtitle(_ cs: CallSheet) -> String? {
        var parts: [String] = []
        if let scenes = cs.scenes { parts.append("\(scenes.count) scene\(scenes.count == 1 ? "" : "s")") }
        if let call = cs.crewCall, !call.isEmpty { parts.append("Call: \(call)") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var scheduleSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let sched = vm.latestSchedule {
                InfoCard(
                    emoji: "📅",
                    title: sched.title,
                    subtitle: "\(sched.totalDays ?? 0) days · \(sched.totalScenes ?? 0) scenes"
                )
                Toggle("Include Schedule in sides", isOn: $vm.includeSchedule)
                    .font(.system(size: 13))
            } else {
                InfoCard(emoji: "📅", title: "No shooting schedule uploaded", subtitle: nil)
            }
        }
    }

    private var matchedDaySection: some View {
        Group {
            if let day = vm.matchedDay, vm.includeSchedule {
                VStack(alignment: .leading, spacing: 6) {
                    Text("MATCHED SHOOT DAY")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.secondary)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("📅 Day \(day.dayNumber.map(String.init) ?? "?")")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.accentColor)
                        if !matchedDayMeta(day).isEmpty {
                            Text(matchedDayMeta(day))
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                        if !vm.matchedSceneNumbers.isEmpty {
                            ChipRow(items: vm.matchedSceneNumbers)
                        }

                        if !vm.extraScenes.isEmpty {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("EXTRA SCENES (FROM OTHER DAYS)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.orange)
                                    .padding(.top, 6)
                                ForEach(vm.extraScenes) { ex in
                                    Text(extraSceneRow(ex))
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
                }
            }
        }
    }

    private func matchedDayMeta(_ day: ShootDay) -> String {
        var parts: [String] = []
        if let d = day.date, !d.isEmpty { parts.append(d) }
        if let c = day.callTime, !c.isEmpty { parts.append(c) }
        if let l = day.location, !l.isEmpty { parts.append(l) }
        return parts.joined(separator: " · ")
    }

    private func extraSceneRow(_ ex: GenerateSidesViewModel.ExtraScene) -> String {
        let info = (ex.day.scenes ?? []).first { $0.sceneNumber?.uppercased() == ex.sceneNumber }
        let intExt = info?.intExt ?? ""
        let location = info?.location?.prefix(25) ?? ""
        let dayNum = ex.day.dayNumber.map(String.init) ?? "?"
        return "Sc. \(ex.sceneNumber) — \(intExt) \(location)  (Day \(dayNum))"
    }

    private var manualScenesSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(vm.useCallSheetScenes ? "ADDITIONAL SCENES (MANUAL)" : "CUSTOM SCENES (REQUIRED)")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)
            TextField("e.g. 1, 3, 5-8, 12A", text: $vm.manualScenes)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: vm.manualScenes) { _ in
                    // In custom-scenes mode, the matched day is derived from the
                    // manual list, so recompute as the user types.
                    if !vm.useCallSheetScenes { vm.computeMatchedShootDay() }
                }
        }
    }

    private var summaryCard: some View {
        Group {
            if !vm.finalSceneNumbers.isEmpty {
                let count = vm.finalSceneNumbers.count
                let list = vm.finalSceneNumbers.joined(separator: ", ")
                let scheduleStr = (vm.includeSchedule && vm.matchedDay != nil) ? "  + 1 shoot day" : ""
                Text("\(count) scene(s): \(list)\(scheduleStr)")
                    .font(.system(size: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(Color.accentColor.opacity(0.10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.accentColor, lineWidth: 1)
                    )
                    .cornerRadius(8)
            }
        }
    }

    private var titleSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("TITLE (OPTIONAL)")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)
            TextField("Auto-generated", text: $vm.title)
                .textFieldStyle(.roundedBorder)
        }
    }

    private func submit() {
        Task {
            if await vm.submit() {
                onCompleted()
                dismiss()
            }
        }
    }
}

// MARK: - Reusable info card

private struct InfoCard: View {
    let emoji: String
    let title: String
    let subtitle: String?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(emoji).font(.system(size: 18))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .bold))
                if let s = subtitle, !s.isEmpty {
                    Text(s).font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(10)
    }
}
