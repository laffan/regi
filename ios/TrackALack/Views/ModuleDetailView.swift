import SwiftUI

/// 1h on a phone — a module drilled in from its widget: its chart, its entries,
/// its goals and milestones, and the API panel saying what it publishes and
/// reads. Calories adds the two panels only it has.
struct ModuleDetailView: View {
    @EnvironmentObject var store: Store
    let slug: String

    @State private var range = 30

    var body: some View {
        let def = Modules.def(slug)
        let state = store.userModule(slug)
        let pair = Crosstalk.all.first { $0.requires.contains(slug) }

        ScrollView {
            VStack(spacing: 1) {
                // Header
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .center, spacing: 10) {
                        VectorIcon(def.icon, size: 22)
                        Text(def.name).font(Theme.heading(28))
                        Spacer()
                        Tag(text: state?.active == true ? "Active" : "Off",
                            kind: state?.active == true ? .accent : .neutral)
                    }

                    Button {
                        Task { await store.setModuleActive(slug, !(state?.active ?? false)) }
                    } label: {
                        Text(state?.active == true ? "Deactivate" : "Activate")
                            .font(Theme.font(14, .heavy))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 40)
                            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.bg)

                // A module recording two units draws one against the other —
                // words as bars, minutes as the line.
                if pair == nil, let byUnit = def.seriesByUnit {
                    MeasureChartCell(def: def, seriesByUnit: byUnit, window: range) { newRange in
                        range = newRange
                    }
                }

                // Chart — the crosstalk pair this module takes part in, if any.
                if let pair {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(pair.title).font(Theme.heading(17))
                            Spacer()
                            Segmented(options: ["14 d", "30 d", "90 d"], selected: [14, 30, 90].firstIndex(of: range) ?? 1) { index in
                                range = [14, 30, 90][index]
                            }
                        }
                        ChartCell(chart: pair, window: range, height: 150)
                            .padding(.horizontal, -20) // the cell brings its own padding
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .background(Theme.bg)
                }

                // Today's entries
                VStack(alignment: .leading, spacing: 10) {
                    Text(slug == "calories" ? "Today's meals" : "Today's \(def.name.lowercased())")
                        .font(Theme.heading(17))

                    let entries = store.entries(on: store.today).filter { $0.moduleSlug == slug }
                    if entries.isEmpty {
                        Text("Nothing logged today.").font(Theme.font(13)).opacity(0.6)
                    }

                    ForEach(entries) { entry in
                        if slug == "calories", let items = entry.items, !items.isEmpty {
                            ForEach(items) { item in
                                HStack(alignment: .top, spacing: 10) {
                                    Text(Dates.timeOfDay(entry.occurredAt))
                                        .font(Theme.font(12)).opacity(0.6)
                                        .frame(width: 44, alignment: .leading)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.name).font(Theme.font(13.5))
                                        HStack(spacing: 6) {
                                            if let portion = item.portion {
                                                Text(portion).font(Theme.font(11.5)).opacity(0.55)
                                            }
                                            matchTag(item)
                                        }
                                    }
                                    Spacer(minLength: 6)
                                    Text(Format.group(item.kcal ?? 0)).font(Theme.font(13, .heavy))
                                }
                                .padding(.vertical, 7)
                                .overlay(alignment: .bottom) { Rule() }
                            }
                        } else {
                            EntryRow(entry: entry)
                                .padding(.horizontal, -16)
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.bg)

                GoalsAndMilestones(slug: slug)

                if slug == "writing" {
                    WritingProjectsPanel()
                    HeadlineMeasurePanel()
                }

                if slug == "calories" {
                    SavedMealsPanel()
                    SourcesPanel()
                }

                ModuleAPIPanel(def: def)
            }
            .background(Theme.line)
        }
        .background(Theme.warm)
        .navigationTitle(def.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func matchTag(_ item: MealItem) -> some View {
        if let ref = item.matchRef, let source = item.matchSource, source != "manual" {
            Tag(text: "\(source == "usda" ? "USDA" : "OFF") \(ref)", kind: .neutral)
        } else {
            Tag(text: "No match — set by hand", kind: .outline)
        }
    }
}

struct GoalsAndMilestones: View {
    @EnvironmentObject var store: Store
    let slug: String

    var body: some View {
        let goals = store.goals.filter { $0.moduleSlug == slug }

        VStack(alignment: .leading, spacing: 14) {
            ForEach(["goal", "milestone"], id: \.self) { kind in
                let matching = goals.filter { $0.kind == kind }
                if !matching.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Kicker(icon: kind == "goal" ? .target : .flag, text: kind == "goal" ? "Goals" : "Milestones")
                        ForEach(matching) { goal in
                            let readout = GoalReadouts.read(goal, store: store)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(goal.title).font(Theme.font(13.5, .heavy))
                                Text(readout.progress).font(Theme.font(11.5)).opacity(0.6)
                            }
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bg)
    }
}

struct SavedMealsPanel: View {
    @EnvironmentObject var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker(icon: .bookmark, text: "Saved meals", muted: true)

            ForEach(store.savedMeals) { meal in
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meal.name).font(Theme.font(13, .heavy))
                        if let detail = meal.detail {
                            Text(detail).font(Theme.font(11.5)).opacity(0.6)
                        }
                    }
                    Spacer(minLength: 6)
                    Text(Format.group(meal.kcal)).font(Theme.font(12.5, .heavy))
                    Button {
                        Task { await store.logSavedMeal(meal.id) }
                    } label: {
                        Text("Add")
                            .font(Theme.font(12, .heavy))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.ink)
                }
                .padding(.vertical, 8)
                .overlay(alignment: .bottom) { Rule() }
            }

            Text("Save any meal, or a single item, from the log for one-tap entry.")
                .font(Theme.font(11)).opacity(0.55)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warm)
    }
}

struct SourcesPanel: View {
    @EnvironmentObject var store: Store

    var body: some View {
        let order = store.userModule("calories")?.sourceOrder ?? ["usda", "off"]

        VStack(alignment: .leading, spacing: 10) {
            Kicker(icon: .chart, text: "Sources", muted: true)

            ForEach([("usda", "USDA FoodData Central first"), ("off", "Open Food Facts first")], id: \.0) { source, label in
                Button {
                    Task { await store.setSourceOrder(source == "usda" ? ["usda", "off"] : ["off", "usda"]) }
                } label: {
                    HStack(spacing: 8) {
                        Circle()
                            .stroke(order.first == source ? Theme.accent : Theme.divider, lineWidth: 1.5)
                            .background(Circle().fill(order.first == source ? Theme.accent : .clear).padding(4))
                            .frame(width: 16, height: 16)
                        Text(label).font(Theme.font(13))
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.ink)
            }

            Text("Barcodes always resolve through Open Food Facts.")
                .font(Theme.font(11)).opacity(0.55)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warm)
    }
}

/// What the module publishes, what it reads, and who reads it. The technical
/// detail lives here rather than on the dashboard.
struct ModuleAPIPanel: View {
    let def: ModuleDef

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker(icon: .chart, text: "Module API", muted: true)

            entry("Publishes", def.publishes.joined(separator: ", "))
            entry(
                "Subscribes to",
                def.subscribes.isEmpty
                    ? "nothing"
                    : def.subscribes.map { "\($0) — from \(Modules.publisher(of: $0)?.name ?? "elsewhere")" }
                        .joined(separator: ", ")
            )
            entry("Read by", readBy)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warm)
    }

    private var readBy: String {
        let widgets = Crosstalk.all
            .filter { $0.bars == def.primarySeries || $0.line == def.primarySeries }
            .map { "\($0.title) widget" }
        let modules = Modules.order
            .compactMap { Modules.all[$0] }
            .filter { $0.subscribes.contains(def.primarySeries) }
            .map { "\($0.name) module" }
        let all = widgets + modules
        return all.isEmpty ? "nothing yet" : all.joined(separator: ", ")
    }

    private func entry(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(Theme.font(11)).opacity(0.55)
            Text(value).font(Theme.font(12.5, .heavy))
        }
    }
}


/// Writing's chart: the headline unit as bars, the other as a dashed line.
struct MeasureChartCell: View {
    @EnvironmentObject var store: Store
    let def: ModuleDef
    let seriesByUnit: [String: String]
    let window: Int
    let onRange: (Int) -> Void

    var body: some View {
        let headlineUnit = store.writingMeasure.rawValue
        let barSeries = seriesByUnit[headlineUnit] ?? def.primarySeries
        let lineSeries = seriesByUnit.first { $0.key != headlineUnit }?.value

        WidgetCell {
            HStack {
                Text("\(def.name) over time").font(Theme.heading(17))
                Spacer()
                Segmented(options: ["14 d", "30 d", "90 d"], selected: [14, 30, 90].firstIndex(of: window) ?? 1) { index in
                    onRange([14, 30, 90][index])
                }
            }

            CrosstalkChartView(
                domain: Dates.rangeOfDays(store.today, window),
                bars: store.series(named: barSeries),
                line: lineSeries.map { store.series(named: $0) } ?? [],
                lineDashed: true,
                height: 150
            )

            ChartLegend(
                lineLabel: lineSeries ?? "",
                barLabel: barSeries,
                lineDashed: true,
                footnote: Projection.mean(store.series(named: barSeries)).map {
                    "Mean \(Format.group($0)) \(store.writingMeasure.short)"
                }
            )
        }
    }
}

/// The projects, what each has accumulated, and a way to add one. A project
/// carries its own measure — a novel counts words, morning pages count minutes
/// — and a session may still be logged in the other one.
struct WritingProjectsPanel: View {
    @EnvironmentObject var store: Store
    @State private var adding = false

    var body: some View {
        let active = store.writingProjects.filter(\.project.isActive)
        let done = store.writingProjects.filter { !$0.project.isActive }

        VStack(alignment: .leading, spacing: 10) {
            Kicker(icon: .pencil, text: "Projects", muted: true)

            ForEach(active) { item in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(item.project.title).font(Theme.font(13, .heavy))
                        if let kind = item.project.kind {
                            Text(kind).font(Theme.font(11)).opacity(0.55)
                        }
                        Spacer()
                        Button("finish") {
                            Task {
                                await store.updateWritingProject(
                                    item.id,
                                    values: ["status": "finished", "finished_on": Dates.today()]
                                )
                            }
                        }
                        .font(Theme.font(11, .heavy))
                        .foregroundStyle(Theme.accent)
                    }

                    Text(summary(item)).font(Theme.font(11.5)).opacity(0.6)

                    if let target = item.project.target, item.project.targetKind == "total" {
                        ProgressRule(fraction: item.amount / target)
                    }
                }
                .padding(.vertical, 8)
                .overlay(alignment: .bottom) { Rule() }
            }

            if active.isEmpty {
                Text("No projects yet.").font(Theme.font(12.5)).opacity(0.6)
            }
            if !done.isEmpty {
                Text("\(done.count) finished or shelved").font(Theme.font(11.5)).opacity(0.55)
            }

            Button {
                adding = true
            } label: {
                Text("+ New project")
                    .font(Theme.font(14, .heavy))
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.ink)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warm)
        .sheet(isPresented: $adding) { NewProjectSheet() }
    }

    private func summary(_ item: ProjectWithTotals) -> String {
        var line = "\(Format.group(item.amount)) \(item.project.unit.short)"
        if let target = item.project.target {
            line += item.project.targetKind == "total"
                ? " of \(Format.group(target))"
                : " · \(Format.group(target)) \(item.project.unit.short) a day"
        }
        return line + " · \(item.sessions) session\(item.sessions == 1 ? "" : "s")"
    }
}

struct NewProjectSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var kind = ""
    @State private var measure: WritingMeasure = .words
    @State private var target = ""
    @State private var busy = false

    var body: some View {
        SheetFrame(title: "New project") {
            VStack(alignment: .leading, spacing: 14) {
                field("Name", text: $title, placeholder: "The Lantern Room")
                field("Kind (optional)", text: $kind, placeholder: "Novel")

                VStack(alignment: .leading, spacing: 5) {
                    Text("Measured in").font(Theme.font(12)).opacity(0.7)
                    Segmented(
                        options: WritingMeasure.allCases.map(\.label),
                        selected: measure == .words ? 0 : 1
                    ) { index in
                        measure = index == 0 ? .words : .min
                    }
                }

                field(
                    measure == .words ? "Word-count target (optional)" : "Daily minutes target (optional)",
                    text: $target,
                    placeholder: measure == .words ? "50000" : "30"
                )

                LogControl(label: "Add project", busy: busy) {
                    guard !title.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                    busy = true
                    Task {
                        await store.addWritingProject(
                            title: title,
                            kind: kind,
                            measure: measure,
                            target: Double(target)
                        )
                        busy = false
                        dismiss()
                    }
                }
            }
        }
    }

    private func field(_ label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(Theme.font(12)).opacity(0.7)
            TextField(placeholder, text: text)
                .textFieldStyle(.plain)
                .font(Theme.font(15))
                .padding(.horizontal, 10)
                .frame(minHeight: 44)
                .background(Theme.surface)
                .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
        }
    }
}

/// Which unit leads on the calendar. Both are always recorded.
struct HeadlineMeasurePanel: View {
    @EnvironmentObject var store: Store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker(icon: .chart, text: "Headline measure", muted: true)

            ForEach(WritingMeasure.allCases, id: \.rawValue) { measure in
                Button {
                    Task { await store.setWritingMeasure(measure) }
                } label: {
                    HStack(spacing: 8) {
                        Circle()
                            .stroke(store.writingMeasure == measure ? Theme.accent : Theme.divider, lineWidth: 1.5)
                            .background(
                                Circle()
                                    .fill(store.writingMeasure == measure ? Theme.accent : .clear)
                                    .padding(4)
                            )
                            .frame(width: 16, height: 16)
                        Text("\(measure.label) lead on the calendar").font(Theme.font(13))
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.ink)
            }

            Text("Both are always recorded; this only picks which number the week strip and day lines show.")
                .font(Theme.font(11)).opacity(0.55)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.warm)
    }
}
