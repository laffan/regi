import SwiftUI

/// 1g and 3b — the spine.
///
/// Days is the default: one card per day, one summary line per module, taken
/// from each module's own definition. Months trades the summaries for density,
/// a stack of bars per day. Both carry goals and milestones, including ones
/// still ahead.
struct CalendarView: View {
    @EnvironmentObject var store: Store

    enum Mode: String, CaseIterable { case days, months }

    @State private var mode: Mode = .days
    @State private var filter: String? = nil
    @State private var daysShown = 30

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(
                kicker: nil,
                title: mode == .days ? Dates.monthName(store.today) : String(store.today.prefix(4))
            ) {
                Segmented(options: Mode.allCases.map(\.rawValue.capitalized), selected: mode == .days ? 0 : 1) { index in
                    mode = index == 0 ? .days : .months
                }
            }

            ModuleFilter(modules: store.activeModules, selected: $filter)

            if mode == .months {
                StripLegend(
                    modules: shownModules,
                    barHeight: 3,
                    leading: shownModules.count == 1 ? "One bar per day —" : "\(shownModules.count) bars per day —"
                )
            }

            ScrollView {
                VStack(spacing: 0) {
                    if !ahead.isEmpty {
                        AheadBand(items: ahead)
                    }

                    if mode == .days {
                        ForEach(Dates.rangeOfDays(store.today, daysShown).reversed(), id: \.self) { date in
                            DayCard(
                                date: date,
                                modules: shownModules,
                                flag: flags[date],
                                todayMilestone: date == store.today ? nearestMilestone : nil
                            )
                        }

                        Button {
                            daysShown += 30
                        } label: {
                            Text("Load \(Dates.monthName(Dates.addDays(store.today, -(daysShown + 1))))")
                                .font(Theme.font(14, .heavy))
                                .padding(.horizontal, 14)
                                .frame(minHeight: 40)
                                .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(Theme.bg)
                    } else {
                        ForEach(Dates.lastMonths(store.today, 6)) { entry in
                            MonthBlock(
                                year: entry.year,
                                month: entry.month,
                                modules: shownModules,
                                flags: flags
                            )
                        }
                    }
                }
            }
            .background(Theme.bg)
        }
        .background(Theme.warm)
        .refreshable { await store.refresh() }
    }

    private var shownModules: [ModuleDef] {
        guard let filter else { return store.activeModules }
        return store.activeModules.filter { $0.slug == filter }
    }

    private var shownGoals: [Goal] {
        store.goals.filter { goal in shownModules.contains { $0.slug == goal.moduleSlug } }
    }

    private var ahead: [GoalReadouts.Upcoming] {
        GoalReadouts.upcoming(shownGoals, store: store, limit: 4)
    }

    private var flags: [String: GoalReadouts.DayFlag] {
        GoalReadouts.flagged(shownGoals)
    }

    private var nearestMilestone: String? {
        GoalReadouts.nearestMilestone(shownGoals, store: store)
    }
}

// MARK: - Pieces

struct Segmented: View {
    let options: [String]
    let selected: Int
    let onSelect: (Int) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                Button { onSelect(index) } label: {
                    Text(option)
                        .font(Theme.font(13))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(index == selected ? Theme.accent : Color.clear)
                        .foregroundStyle(index == selected ? Theme.bg : Theme.ink)
                }
                .buttonStyle(.plain)
                .overlay(alignment: .leading) {
                    if index > 0 { Rectangle().fill(Theme.divider).frame(width: 1) }
                }
            }
        }
        .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
    }
}

struct ModuleFilter: View {
    let modules: [ModuleDef]
    @Binding var selected: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                Segmented(
                    options: ["All modules"] + modules.map(\.name),
                    selected: selected.flatMap { slug in modules.firstIndex { $0.slug == slug }.map { $0 + 1 } } ?? 0
                ) { index in
                    selected = index == 0 ? nil : modules[index - 1].slug
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(Theme.warm)
        .overlay(alignment: .bottom) { Rule() }
    }
}

struct AheadBand: View {
    let items: [GoalReadouts.Upcoming]

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 6) {
                VectorIcon(.flag, size: 12)
                Text("AHEAD").font(Theme.font(10, .heavy)).kerning(1.2)
            }
            .foregroundStyle(Theme.accent700)

            ForEach(items, id: \.label) { item in
                HStack(spacing: 7) {
                    VectorIcon(Modules.def(item.moduleSlug).icon, size: 12)
                    Text(Dates.shortDate(item.date)).font(Theme.font(12.5, .heavy))
                    Text(item.label).font(Theme.font(12.5))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.accent100)
        .overlay(alignment: .leading) { Rectangle().fill(Theme.accent).frame(width: 4) }
        .overlay(alignment: .bottom) { Rule() }
    }
}

struct DayCard: View {
    @EnvironmentObject var store: Store
    let date: String
    let modules: [ModuleDef]
    let flag: GoalReadouts.DayFlag?
    let todayMilestone: String?

    var body: some View {
        let isToday = date == store.today

        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(Dates.dowShort(date)) \(Dates.dayNumber(date))")
                    .font(Theme.heading(isToday ? 22 : 20))
                if isToday {
                    Text("Today").font(Theme.font(11)).opacity(0.5)
                }
            }

            ForEach(modules, id: \.slug) { module in
                let summary = Modules.daySummary(
                    module.slug,
                    total: store.total(date, module.slug),
                    context: store.dayContext
                )

                HStack(spacing: 8) {
                    HStack(spacing: 7) {
                        VectorIcon(module.icon, size: 12)
                        Text(module.name).font(Theme.font(12.5))
                    }
                    .opacity(0.6)
                    .frame(width: 96, alignment: .leading)

                    if summary.isLogged {
                        Text(summary.text).font(Theme.font(12.5, .heavy))
                    } else {
                        Text("not logged").font(Theme.font(12.5)).opacity(0.4)
                    }

                    if let fraction = summary.barFraction {
                        ProgressRule(fraction: fraction, over: summary.over)
                            .frame(maxWidth: .infinity)
                    } else {
                        Spacer(minLength: 0)
                    }

                    if let note = summary.note {
                        Text(note)
                            .font(Theme.font(12))
                            .foregroundStyle(summary.over ? Theme.accent700 : Theme.ink.opacity(0.5))
                            .fixedSize()
                    }
                }
            }

            if let flag {
                Tag(
                    text: (flag.achieved ? "Reached · " : "Milestone · ") + flag.label,
                    kind: flag.achieved ? .neutral : .accent
                )
            }
            if let todayMilestone {
                Tag(text: "Milestone · \(todayMilestone)", kind: .accent)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isToday ? Theme.warm : Theme.bg)
        .overlay(alignment: .leading) {
            if isToday { Rectangle().fill(Theme.accent).frame(width: 4) }
        }
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// Six months at a glance, each day a stack of one bar per module.
struct MonthBlock: View {
    @EnvironmentObject var store: Store
    let year: Int
    let month: Int
    let modules: [ModuleDef]
    let flags: [String: GoalReadouts.DayFlag]

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)

    var body: some View {
        let cells = Dates.monthGrid(year: year, month: month)
        let dates = cells.compactMap { $0 }
        let logged = dates.filter { date in
            modules.contains { store.logged(date, $0.slug) }
        }

        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(Dates.monthName(year: year, month: month))
                    .font(Theme.heading(15))
                Spacer()
                Text("\(logged.count) of \(dates.count) days")
                    .font(Theme.font(11)).opacity(0.55)
            }

            LazyVGrid(columns: columns, spacing: 0) {
                ForEach(["M", "T", "W", "T", "F", "S", "S"].indices, id: \.self) { index in
                    Text(["M", "T", "W", "T", "F", "S", "S"][index])
                        .font(Theme.font(9, .heavy)).kerning(1)
                        .opacity(0.45)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 4)
                        .padding(.bottom, 4)
                }
            }

            LazyVGrid(columns: columns, spacing: 0) {
                ForEach(Array(cells.enumerated()), id: \.offset) { _, date in
                    if let date {
                        MonthDay(
                            date: date,
                            isToday: date == store.today,
                            flagged: flags[date] != nil,
                            modules: modules
                        )
                    } else {
                        Rectangle()
                            .fill(Theme.ink.opacity(0.03))
                            .aspectRatio(1, contentMode: .fill)
                            .border(Theme.line, width: 0.5)
                    }
                }
            }
        }
        .padding(16)
        .background(Theme.bg)
    }
}

struct MonthDay: View {
    @EnvironmentObject var store: Store
    let date: String
    let isToday: Bool
    let flagged: Bool
    let modules: [ModuleDef]

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .top, spacing: 2) {
                Text("\(Dates.dayNumber(date))").font(Theme.font(11, .heavy))
                Spacer(minLength: 0)
                if flagged { VectorIcon(.flag, size: 9) }
            }

            Spacer(minLength: 0)

            VStack(spacing: 2) {
                ForEach(modules, id: \.slug) { module in
                    Rectangle()
                        .fill(barColour(logged: store.logged(date, module.slug)))
                        .frame(height: 3)
                }
            }
        }
        .padding(4)
        .aspectRatio(1, contentMode: .fill)
        .background(isToday ? Theme.accent : (flagged ? Theme.accent100 : Theme.bg))
        .foregroundStyle(isToday ? Theme.bg : Theme.ink)
        .border(Theme.line, width: 0.5)
    }

    private func barColour(logged: Bool) -> Color {
        if isToday { return logged ? Theme.bg : Theme.bg.opacity(0.35) }
        return logged ? Theme.ink : Theme.ink.opacity(0.13)
    }
}
