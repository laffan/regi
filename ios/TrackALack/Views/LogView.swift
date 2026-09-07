import SwiftUI
import UIKit

/// 1e — text in, parse, review over the keyboard, approve.
///
/// The log is module-agnostic: a line goes to the server, comes back as typed
/// draft rows, and nothing reaches a module until Approve.
struct LogView: View {
    @EnvironmentObject var store: Store
    @State private var text = ""
    @FocusState private var writing: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(kicker: nil, title: "Log") {
                Text("\(Dates.dowShort(store.today)) \(Dates.shortDate(store.today))")
                    .font(Theme.font(11)).opacity(0.55)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("TODAY")
                        .font(Theme.font(10, .heavy)).kerning(1.2).opacity(0.5)
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 6)

                    ForEach(store.entries(on: store.today)) { entry in
                        EntryRow(entry: entry)
                    }

                    if store.entries(on: store.today).isEmpty {
                        Text("Nothing logged yet. Write a line below and it will be parsed for review.")
                            .font(Theme.font(13)).opacity(0.6)
                            .padding(16)
                    }

                    if store.draft != nil, !store.draftRows.isEmpty {
                        ReviewBlock()
                    }
                }
            }
            .background(Theme.bg)

            // The input sits under the thumb, above the tab bar.
            HStack(spacing: 8) {
                TextField("chicken salad, iced tea, 18 pages", text: $text)
                    .textFieldStyle(.plain)
                    .font(Theme.font(15))
                    .padding(.horizontal, 10)
                    .frame(minHeight: 46)
                    .background(Theme.surface)
                    .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                    .focused($writing)
                    .submitLabel(.send)
                    .onSubmit(submit)

                Button(action: submit) {
                    Text(store.busy ? "…" : "Input")
                        .font(Theme.font(15, .heavy))
                        .padding(.horizontal, 18)
                        .frame(minHeight: 46)
                        .background(Theme.accent)
                        .foregroundStyle(Theme.bg)
                }
                .buttonStyle(.plain)
                .disabled(store.busy)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Theme.warm)
            .overlay(alignment: .top) { Rule() }
        }
        .background(Theme.warm)
    }

    private func submit() {
        let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !line.isEmpty else { return }
        Task {
            _ = await store.parse(line)
            text = ""
            writing = false
        }
    }
}

struct EntryRow: View {
    let entry: Entry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(Dates.timeOfDay(entry.occurredAt))
                .font(Theme.font(12)).opacity(0.55)
                .frame(width: 42, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.label ?? Modules.def(entry.moduleSlug).name)
                    .font(Theme.font(13.5))
                if let note = entry.note {
                    Text(note).font(Theme.font(11.5)).opacity(0.55)
                }
            }

            Spacer(minLength: 8)

            Text(shortValue)
                .font(Theme.font(13, .heavy))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(Theme.bg)
        .overlay(alignment: .bottom) { Rule() }
    }

    private var shortValue: String {
        switch entry.moduleSlug {
        case "calories": return Format.group(entry.value ?? 0)
        case "reading": return "\(Format.group(entry.value ?? 0)) p"
        default: return Format.moduleValue(entry.moduleSlug, entry.value, unit: entry.unit)
        }
    }
}

/// The review sheet: only what was actually parsed, editable before it lands.
struct ReviewBlock: View {
    @EnvironmentObject var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("REVIEW")
                        .font(Theme.font(10, .heavy)).kerning(1.2)
                        .foregroundStyle(Theme.accent)
                    Text("\(store.draftRows.count) draft \(store.draftRows.count == 1 ? "entry" : "entries")")
                        .font(Theme.heading(20))
                }
                Spacer()
                Tag(text: store.draft?.parser == "fallback" ? "parsed locally" : "parsed", kind: .outline)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            VStack(spacing: 12) {
                ForEach(store.draftRows) { row in
                    DraftCard(row: row)
                }

                HStack(spacing: 8) {
                    Button {
                        Task { await store.approveDraft() }
                    } label: {
                        HStack {
                            Text("Approve").font(Theme.font(15, .heavy))
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 14)
                        .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                        .background(Theme.accent)
                        .foregroundStyle(Theme.bg)
                    }
                    .buttonStyle(.plain)

                    Button {
                        Task { await store.discardDraft() }
                    } label: {
                        Text("Discard")
                            .font(Theme.font(15, .heavy))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 46)
                            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 14)
        }
        .background(Theme.warm)
        .overlay(alignment: .top) { Rule() }
    }
}

struct DraftCard: View {
    @EnvironmentObject var store: Store
    let row: DraftRow

    @State private var items: [MealItem] = []
    @State private var label = ""
    @State private var value = ""

    var body: some View {
        let def = Modules.def(row.moduleSlug)

        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Tag(text: def.name, icon: def.icon, kind: .accent)
                Spacer()
                if let note = row.matchNote {
                    Text(note).font(Theme.font(11)).opacity(0.5)
                }
            }

            if items.isEmpty {
                HStack(spacing: 8) {
                    field(text: $label, onCommit: { Task { await store.updateDraftRow(row, label: label) } })
                    field(text: $value, width: 76, keyboard: .decimalPad, onCommit: {
                        Task { await store.updateDraftRow(row, value: Double(value)) }
                    })
                }
            } else {
                ForEach(items.indices, id: \.self) { index in
                    HStack(spacing: 8) {
                        field(
                            text: Binding(get: { items[index].name }, set: { items[index].name = $0 }),
                            onCommit: { Task { await store.updateDraftRow(row, items: items) } }
                        )
                        field(
                            text: Binding(
                                get: { items[index].kcal.map { Format.group($0) } ?? "" },
                                set: { items[index].kcal = Double($0.replacingOccurrences(of: ",", with: "")) }
                            ),
                            width: 76,
                            keyboard: .numberPad,
                            onCommit: { Task { await store.updateDraftRow(row, items: items) } }
                        )
                    }
                }
            }

            if row.moduleSlug == "reading",
               let end = row.payload["end_page"]?.intValue,
               let book = store.currentBook, let total = book.totalPages {
                Text("Takes you to p. \(end) of \(total)")
                    .font(Theme.font(11.5)).opacity(0.6)
            }
        }
        .padding(12)
        .background(Theme.warm)
        .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
        .onAppear {
            items = row.items
            label = row.label ?? ""
            value = row.value.map { Format.group($0) } ?? ""
        }
    }

    private func field(
        text: Binding<String>,
        width: CGFloat? = nil,
        keyboard: UIKeyboardType = .default,
        onCommit: @escaping () -> Void
    ) -> some View {
        TextField("", text: text)
            .textFieldStyle(.plain)
            .keyboardType(keyboard)
            .font(Theme.font(15))
            .padding(.horizontal, 10)
            .frame(width: width, height: 40)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
            .onSubmit(onCommit)
    }
}
