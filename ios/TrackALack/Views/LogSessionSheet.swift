import SwiftUI
import UIKit

/// A writing session: which project, how much, and in which unit. The unit
/// defaults to the project's own — a novel counts words, morning pages count
/// minutes — but either is always available, because some days you only know
/// you sat there for half an hour.
struct LogSessionSheet: View {
    let projects: [ProjectWithTotals]
    var initialProjectId: String?

    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State private var projectId: String = ""
    @State private var measure: WritingMeasure = .words
    @State private var amount = ""
    @State private var note = ""
    @State private var busy = false

    private var active: [ProjectWithTotals] { projects.filter(\.project.isActive) }
    private var project: ProjectWithTotals? { projects.first { $0.id == projectId } }

    var body: some View {
        SheetFrame(title: "Log session") {
            VStack(alignment: .leading, spacing: 14) {
                if !active.isEmpty {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Project").font(Theme.font(12)).opacity(0.7)
                        Picker("Project", selection: $projectId) {
                            ForEach(active) { item in
                                Text(item.project.title).tag(item.id)
                            }
                            Text("No project").tag("")
                        }
                        .pickerStyle(.menu)
                        .tint(Theme.accent)
                        .onChange(of: projectId) { _, newValue in
                            if let picked = projects.first(where: { $0.id == newValue }) {
                                measure = picked.project.unit
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text(measure == .words ? "Words written" : "Minutes spent")
                        .font(Theme.font(12)).opacity(0.7)

                    HStack(spacing: 8) {
                        TextField(measure == .words ? "640" : "25", text: $amount)
                            .textFieldStyle(.plain)
                            .keyboardType(.numberPad)
                            .font(Theme.font(15))
                            .padding(.horizontal, 10)
                            .frame(minHeight: 44)
                            .background(Theme.surface)
                            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))

                        Segmented(
                            options: WritingMeasure.allCases.map(\.label),
                            selected: measure == .words ? 0 : 1
                        ) { index in
                            measure = index == 0 ? .words : .min
                        }
                    }
                }

                if let project {
                    Text(progressLine(project))
                        .font(Theme.font(11.5)).opacity(0.6)
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text("Note (optional)").font(Theme.font(12)).opacity(0.7)
                    TextField("finished the chapter", text: $note)
                        .textFieldStyle(.plain)
                        .font(Theme.font(15))
                        .padding(.horizontal, 10)
                        .frame(minHeight: 44)
                        .background(Theme.surface)
                        .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                }

                LogControl(label: "Log", busy: busy) {
                    guard let value = Double(amount), value > 0 else { return }
                    busy = true
                    Task {
                        await store.logWritingSession(
                            project: project?.project,
                            amount: value,
                            measure: measure,
                            note: note
                        )
                        busy = false
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            projectId = initialProjectId ?? active.first?.id ?? ""
            measure = project?.project.unit ?? store.writingMeasure
        }
    }

    private func progressLine(_ item: ProjectWithTotals) -> String {
        guard let target = item.project.target else {
            return "\(item.sessions) session\(item.sessions == 1 ? "" : "s") so far"
        }
        if item.project.targetKind == "daily" {
            return "Daily target \(Format.group(target)) \(item.project.unit.short)"
        }
        return "\(Format.group(item.amount)) of \(Format.group(target)) \(item.project.unit.short) so far"
    }
}
