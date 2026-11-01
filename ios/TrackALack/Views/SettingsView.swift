import SwiftUI

/// Settings, with Sharing as the pane the designs work through: per-module
/// grants that can be withdrawn, and connections added by login email.
struct SettingsView: View {
    @EnvironmentObject var store: Store

    enum Pane: String, CaseIterable {
        case sharing, modules, account
        var title: String { rawValue.capitalized }
    }

    @State private var pane: Pane = .sharing

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(kicker: nil, title: "Settings")

            ScrollView(.horizontal, showsIndicators: false) {
                Segmented(
                    options: Pane.allCases.map(\.title),
                    selected: Pane.allCases.firstIndex(of: pane) ?? 0
                ) { index in
                    pane = Pane.allCases[index]
                }
                .padding(16)
            }
            .background(Theme.warm)
            .overlay(alignment: .bottom) { Rule() }

            ScrollView {
                switch pane {
                case .sharing: SharingPane()
                case .modules: ModulesPane()
                case .account: AccountPane()
                }
            }
            .background(Theme.bg)
        }
        .background(Theme.warm)
    }
}

struct SharingPane: View {
    @EnvironmentObject var store: Store
    @State private var email = ""
    @State private var found: Person?
    @State private var searchNote: String?
    @State private var editing: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Connections see the modules you grant them, on their calendar alongside their own. Sharing is per module and can be withdrawn at any time.")
                .font(Theme.font(13))
                .opacity(0.75)

            VStack(alignment: .leading, spacing: 5) {
                Text("Add a connection by login email").font(Theme.font(12)).opacity(0.7)
                HStack(spacing: 8) {
                    TextField("dana@example.com", text: $email)
                        .textFieldStyle(.plain)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .font(Theme.font(15))
                        .padding(.horizontal, 10)
                        .frame(minHeight: 44)
                        .background(Theme.surface)
                        .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))

                    Button {
                        Task {
                            searchNote = nil
                            found = await store.findPerson(email: email)
                            if found == nil { searchNote = "No account uses that email." }
                        }
                    } label: {
                        Text("Search")
                            .font(Theme.font(15, .heavy))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 44)
                            .background(Theme.accent)
                            .foregroundStyle(Theme.onAccent)
                    }
                    .buttonStyle(.plain)
                }
            }

            if let searchNote {
                Text(searchNote).font(Theme.font(12.5)).foregroundStyle(Theme.accent700)
            }

            if let found {
                HStack(spacing: 12) {
                    Rectangle().fill(Theme.neutral400).frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(found.displayName ?? found.email).font(Theme.font(13.5, .heavy))
                        Text(found.email).font(Theme.font(11.5)).opacity(0.6)
                    }
                    Spacer()
                    Button {
                        Task {
                            await store.requestConnection(email: found.email)
                            self.found = nil
                            email = ""
                        }
                    } label: {
                        Text("Send request")
                            .font(Theme.font(13, .heavy))
                            .padding(.horizontal, 12).frame(minHeight: 36)
                            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                }
                .padding(12)
                .background(Theme.warm)
                .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
            }

            Rectangle().fill(Theme.divider).frame(height: 2)

            HStack(alignment: .firstTextBaseline) {
                Text("Connections").font(Theme.heading(20))
                Spacer()
                Text("\(store.connections.filter { $0.status == "active" }.count) active · \(store.connections.filter { $0.status == "pending" }.count) pending")
                    .font(Theme.font(11.5)).opacity(0.55)
            }

            ForEach(store.connections) { connection in
                ConnectionRow(
                    connection: connection,
                    person: store.people[connection.otherId],
                    editing: editing == connection.id,
                    toggleEditing: { editing = editing == connection.id ? nil : connection.id }
                )
            }

            if store.connections.isEmpty {
                Text("No connections yet.").font(Theme.font(13)).opacity(0.6)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ConnectionRow: View {
    @EnvironmentObject var store: Store
    let connection: Connection
    let person: Person?
    let editing: Bool
    let toggleEditing: () -> Void

    var body: some View {
        let incoming = connection.status == "pending" && !connection.iRequested

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(person?.displayName ?? "Unknown").font(Theme.font(14, .heavy))
                    Text(person?.email ?? "").font(Theme.font(11.5)).opacity(0.55)
                }
                Spacer()

                if incoming {
                    HStack(spacing: 6) {
                        Button("Accept") { Task { await store.respond(to: connection.id, accept: true) } }
                        Button("Decline") { Task { await store.respond(to: connection.id, accept: false) } }
                    }
                    .font(Theme.font(13, .heavy))
                    .foregroundStyle(Theme.accent700)
                } else if connection.status == "pending" {
                    Button("Cancel") { Task { await store.removeConnection(connection.id) } }
                        .font(Theme.font(13, .heavy))
                        .foregroundStyle(Theme.accent700)
                } else {
                    Button(editing ? "Done" : "Edit", action: toggleEditing)
                        .font(Theme.font(13, .heavy))
                        .foregroundStyle(Theme.accent700)
                }
            }

            if connection.status == "pending" {
                Tag(text: connection.iRequested ? "Awaiting reply" : "Wants to connect", kind: .outline)
            } else {
                labelled("Shares with you", slugs: connection.theyShare, kind: .neutral)

                if editing {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("You share").font(Theme.font(11)).opacity(0.55)
                        ForEach(store.activeModules, id: \.slug) { module in
                            Toggle(isOn: Binding(
                                get: { connection.iShare.contains(module.slug) },
                                set: { granted in
                                    Task {
                                        await store.setShare(
                                            connectionId: connection.id,
                                            slug: module.slug,
                                            granted: granted
                                        )
                                    }
                                }
                            )) {
                                HStack(spacing: 6) {
                                    VectorIcon(module.icon, size: 13)
                                    Text(module.name).font(Theme.font(13))
                                }
                            }
                            .tint(Theme.accent)
                        }
                    }
                } else {
                    labelled("You share", slugs: connection.iShare, kind: .accent)
                }
            }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Rule() }
    }

    private func labelled(_ title: String, slugs: [String], kind: Tag.Kind) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(Theme.font(11)).opacity(0.55)
            if slugs.isEmpty {
                Text("nothing").font(Theme.font(12.5)).opacity(0.5)
            } else {
                HStack(spacing: 5) {
                    ForEach(slugs, id: \.self) { slug in
                        Tag(text: Modules.def(slug).name, icon: Modules.def(slug).icon, kind: kind)
                    }
                }
            }
        }
    }
}

struct ModulesPane: View {
    @EnvironmentObject var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Activating a module adds its widgets to the dashboard and its line to every calendar day. Nothing is deleted when you turn one off.")
                .font(Theme.font(13)).opacity(0.75)

            ForEach(Modules.order, id: \.self) { slug in
                let def = Modules.def(slug)
                let active = store.userModule(slug)?.active ?? false

                HStack(spacing: 12) {
                    VectorIcon(def.icon, size: 16)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(def.name).font(Theme.font(14, .heavy))
                        Text("publishes \(def.publishes.joined(separator: ", "))")
                            .font(Theme.font(11.5)).opacity(0.55)
                    }
                    Spacer()
                    Button {
                        Task { await store.setModuleActive(slug, !active) }
                    } label: {
                        Text(active ? "Deactivate" : "Activate")
                            .font(Theme.font(13, .heavy))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 36)
                            .background(active ? Color.clear : Theme.accent)
                            .foregroundStyle(active ? Theme.ink : Theme.bg)
                            .overlay(active ? Rectangle().stroke(Theme.divider, lineWidth: 1) : nil)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) { Rule() }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AccountPane: View {
    @EnvironmentObject var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Login email").font(Theme.font(12)).opacity(0.7)
                Text(store.profile?.email ?? "—").font(Theme.font(15))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Display name").font(Theme.font(12)).opacity(0.7)
                Text(store.profile?.displayName ?? "—").font(Theme.font(15))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Units").font(Theme.font(12)).opacity(0.7)
                Text("\(store.profile?.weightUnit ?? "lb") · \(store.profile?.distanceUnit ?? "mi")")
                    .font(Theme.font(15))
            }

            Button {
                Task { await store.signOut() }
            } label: {
                Text("Sign out")
                    .font(Theme.font(14, .heavy))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.ink)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
