//
//  SidesItemRow.swift
//
//  A card row for the Sides list. Shows title, status badge, meta, scene chips,
//  and View / Download buttons. Mirrors Android's `SidesAdapter` item layout.
//

import SwiftUI

struct SidesItemRow: View {

    let sides: Sides
    let onView: () -> Void
    let onDownload: () -> Void

    private var statusColor: Color {
        switch sides.status.lowercased() {
        case "ready":      return .green
        case "generating": return .orange
        case "error":      return .red
        case "archived":   return .gray
        default:           return .secondary
        }
    }

    private var isReady: Bool { sides.status.lowercased() == "ready" }

    private var metaLine: String {
        var parts: [String] = []
        if let n = sides.totalScenes { parts.append("\(n) scene\(n == 1 ? "" : "s")") }
        if let d = sides.downloadCount { parts.append("\(d) download\(d == 1 ? "" : "s")") }
        if let created = sides.createdAt { parts.append(String(created.prefix(10))) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(sides.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                Spacer(minLength: 8)
                statusBadge
            }

            if !metaLine.isEmpty {
                Text(metaLine)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            if let nums = sides.sceneNumbers, !nums.isEmpty {
                ChipRow(items: nums)
            }

            if isReady {
                HStack(spacing: 8) {
                    Button(action: onView) {
                        Label("View", systemImage: "eye")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.accentColor)

                    Button(action: onDownload) {
                        Label("Download", systemImage: "arrow.down.circle")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.top, 4)
            } else if sides.status.lowercased() == "generating" {
                HStack(spacing: 6) {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .scaleEffect(0.7)
                    Text("Generating sides…")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .padding(.top, 4)
            } else if let err = sides.error, !err.isEmpty {
                Text(err)
                    .font(.system(size: 11))
                    .foregroundColor(.red)
                    .padding(.top, 4)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(.separator), lineWidth: 0.5)
        )
    }

    private var statusBadge: some View {
        Text(sides.status.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(statusColor.opacity(0.18))
            .foregroundColor(statusColor)
            .clipShape(Capsule())
    }
}

// MARK: - Call sheet row

struct CallSheetRow: View {
    let callSheet: CallSheet

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "doc.text")
                    .foregroundColor(.accentColor)
                Text(callSheet.title)
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                if let status = callSheet.status {
                    Text(status.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.accentColor.opacity(0.15))
                        .foregroundColor(.accentColor)
                        .clipShape(Capsule())
                }
            }

            HStack(spacing: 8) {
                if let scenes = callSheet.scenes {
                    Text("\(scenes.count) scene\(scenes.count == 1 ? "" : "s")")
                }
                if let call = callSheet.crewCall, !call.isEmpty {
                    Text("· Call \(call)")
                }
                if let date = callSheet.date, !date.isEmpty {
                    Text("· \(date)")
                }
            }
            .font(.system(size: 11))
            .foregroundColor(.secondary)

            if let nums = callSheet.scenes?.map(\.sceneNumber), !nums.isEmpty {
                ChipRow(items: nums)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(.separator), lineWidth: 0.5)
        )
    }
}

// MARK: - Chip row

/// Wraps strings into a flowing horizontal layout. iOS 16+ provides `FlexibleLayout`
/// via WrappedHStack on the App Store, but rolling our own keeps deps light.
struct ChipRow: View {
    let items: [String]
    var body: some View {
        FlexibleHStack(spacing: 4) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Color.accentColor.opacity(0.12))
                    .foregroundColor(.accentColor)
                    .clipShape(Capsule())
            }
        }
    }
}

/// Simple flowing horizontal layout — wraps to next line when full.
struct FlexibleHStack<Content: View>: View {
    let spacing: CGFloat
    let content: () -> Content
    init(spacing: CGFloat = 4, @ViewBuilder content: @escaping () -> Content) {
        self.spacing = spacing
        self.content = content
    }
    var body: some View {
        // FlowLayout — uses iOS 16's Layout protocol via Flow
        Flow(spacing: spacing) { content() }
    }
}

/// Internal flow layout using iOS 16+ Layout protocol.
struct Flow: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var height: CGFloat = 0
        var line: CGFloat = 0
        var lineHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if line + size.width > maxWidth {
                height += lineHeight + spacing
                line = size.width + spacing
                lineHeight = size.height
            } else {
                line += size.width + spacing
                lineHeight = max(lineHeight, size.height)
            }
        }
        height += lineHeight
        return CGSize(width: maxWidth.isFinite ? maxWidth : line, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            s.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
