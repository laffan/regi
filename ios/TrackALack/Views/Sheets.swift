import SwiftUI

/// The small "how many?" sheet behind Log pages / Log run / Log session.
struct ValueSheet: View {
    struct Field: Identifiable {
        let key: String
        let label: String
        var placeholder = ""
        var id: String { key }
    }

    let title: String
    let fields: [Field]
    var submitLabel = "Log"
    let onSubmit: ([String: String]) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var values: [String: String] = [:]
    @State private var busy = false

    var body: some View {
        SheetFrame(title: title) {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(fields) { field in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(field.label).font(Theme.font(12)).opacity(0.7)
                        TextField(field.placeholder, text: binding(for: field.key))
                            .textFieldStyle(.plain)
                            .font(Theme.font(15))
                            .padding(.horizontal, 10)
                            .frame(minHeight: 44)
                            .background(Theme.surface)
                            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                    }
                }

                LogControl(label: submitLabel, busy: busy) {
                    busy = true
                    Task {
                        await onSubmit(values)
                        busy = false
                        dismiss()
                    }
                }
            }
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })
    }
}

/// Logging a meal from the dashboard goes through the parser like any other
/// line, so it lands in review rather than straight into the module.
struct ParseSheet: View {
    let prompt: String
    let placeholder: String

    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var busy = false

    var body: some View {
        SheetFrame(title: "Log meal") {
            VStack(alignment: .leading, spacing: 14) {
                Text(prompt).font(Theme.font(12)).opacity(0.7)

                TextField(placeholder, text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(Theme.font(15))
                    .padding(10)
                    .frame(minHeight: 80, alignment: .topLeading)
                    .background(Theme.surface)
                    .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))

                Text("Items are matched against USDA FoodData Central and Open Food Facts, then shown for review.")
                    .font(Theme.font(11)).opacity(0.55)

                LogControl(label: "Parse", busy: busy) {
                    guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                    busy = true
                    Task {
                        _ = await store.parse(text)
                        busy = false
                        store.selectedTab = .log
                        dismiss()
                    }
                }
            }
        }
    }
}

/// Shared chrome: flush-left title, hairline rule, the Modernist ground.
struct SheetFrame<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(title).font(Theme.heading(22))
                Spacer()
                Button("Close") { dismiss() }
                    .font(Theme.font(14, .heavy))
                    .foregroundStyle(Theme.accent)
            }
            .padding(.horizontal, 20)
            .padding(.top, 22)
            .padding(.bottom, 14)

            Rule()

            content
                .padding(20)

            Spacer(minLength: 0)
        }
        .background(Theme.bg)
        .presentationDetents([.medium, .large])
    }
}
