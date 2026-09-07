import SwiftUI

@main
struct TrackALackApp: App {
    @StateObject private var store = Store()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task { await store.bootstrap() }
                .preferredColorScheme(.light) // the system is drawn on a warm light ground
        }
    }
}

enum AppTab: String, CaseIterable {
    case dashboard, log, calendar, settings

    var title: String {
        switch self {
        case .dashboard: return "Dashboard"
        case .log: return "Log"
        case .calendar: return "Calendar"
        case .settings: return "Settings"
        }
    }

    var icon: IconName {
        switch self {
        case .dashboard: return .grid
        case .log: return .list
        case .calendar: return .calendar
        case .settings: return .settings
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        Group {
            if store.booting {
                ZStack { Theme.warm.ignoresSafeArea(); ProgressView() }
            } else if !store.signedIn {
                SignInView()
            } else {
                shell
            }
        }
    }

    private var shell: some View {
        VStack(spacing: 0) {
            NavigationStack {
                Group {
                    switch store.selectedTab {
                    case .dashboard: DashboardView()
                    case .log: LogView()
                    case .calendar: CalendarView()
                    case .settings: SettingsView()
                    }
                }
                .navigationDestination(for: String.self) { slug in
                    ModuleDetailView(slug: slug)
                }
            }

            TabBar(selection: $store.selectedTab)
        }
        .background(Theme.warm)
    }
}

/// The bottom bar: flush icons over uppercase labels, accent on the current tab.
struct TabBar: View {
    @Binding var selection: AppTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 3) {
                        VectorIcon(tab.icon, size: 20, lineWidth: 2)
                        Text(tab.title.uppercased())
                            .font(Theme.font(9, .heavy))
                            .kerning(0.8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .opacity(selection == tab ? 1 : 0.45)
                    .foregroundStyle(selection == tab ? Theme.accent : Theme.ink)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 9)
        .padding(.bottom, 6)
        .background(Theme.warm)
        .overlay(alignment: .top) { Rule() }
    }
}

/// The header every screen opens with: kicker over a heading, hairline under.
struct ScreenHeader<Trailing: View>: View {
    let kicker: String?
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                if let kicker {
                    Text(kicker.uppercased())
                        .font(Theme.font(10, .heavy))
                        .kerning(1.2)
                        .opacity(0.5)
                }
                Text(title).font(Theme.heading(25))
            }
            Spacer()
            trailing
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .background(Theme.warm)
        .overlay(alignment: .bottom) { Rule() }
    }
}

extension ScreenHeader where Trailing == EmptyView {
    init(kicker: String?, title: String) {
        self.init(kicker: kicker, title: title) { EmptyView() }
    }
}
