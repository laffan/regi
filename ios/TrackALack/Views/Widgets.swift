import SwiftUI

/// The dashboard's widget host: each active module contributes one cell, and
/// every cell ends in the same Log control.
struct ModuleWidget: View {
    @EnvironmentObject var store: Store
    let slug: String

    var body: some View {
        switch slug {
        case "weight": WeightWidget()
        case "calories": CaloriesWidget()
        case "reading": ReadingWidget()
        case "running": RunningWidget()
        case "writing": WritingWidget()
        case "sleep": SleepWidget()
        default: EmptyView()
        }
    }
}

// MARK: - Weight

struct WeightWidget: View {
    @EnvironmentObject var store: Store
    @State private var pending: Double?

    private let ticks = 13
    private let range = 0.6

    var body: some View {
        let series = store.series("weight")
        let last = store.total(store.today, "weight")?.value ?? series.last?.value ?? 180
        let value = pending ?? last
        let low = ((last - range) * 10).rounded() / 10
        let high = ((last + range) * 10).rounded() / 10
        let rate = Projection.weeklyRate(Array(Projection.movingMean(series, window: 7).suffix(21)))
        let loggedAt = store.entries(on: store.today).first { $0.moduleSlug == "weight" }?.occurredAt

        WidgetCell {
            HStack(alignment: .firstTextBaseline) {
                NavigationLink(value: "weight") { Kicker(icon: .scale, text: "Weight") }
                    .buttonStyle(.plain)
                Spacer()
                Text(loggedAt.map(Dates.timeOfDay) ?? (store.profile?.weightUnit ?? "lb"))
                    .font(Theme.font(11)).opacity(0.5)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Format.weight(value)).font(Theme.heading(40))
                Text(store.profile?.weightUnit ?? "lb").font(Theme.font(12)).opacity(0.6)
                Spacer()
                if let rate {
                    Text("\(Format.signed(rate)) / wk")
                        .font(Theme.font(12, .heavy))
                        .foregroundStyle(Theme.accent700)
                }
            }

            // Drag the dial rather than type at a keypad.
            GeometryReader { geometry in
                let width = geometry.size.width
                let active = Int(((value - low) / max(high - low, 0.01) * Double(ticks - 1)).rounded())

                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(0..<ticks, id: \.self) { index in
                        Rectangle()
                            .fill(index == active ? Theme.accent : Theme.ink.opacity(0.3))
                            .frame(width: index == active ? 3 : 1,
                                   height: index == active ? 30 : (index % 3 == 1 ? 18 : 11))
                    }
                }
                .frame(width: width, height: 30, alignment: .center)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { drag in
                            let fraction = min(max(drag.location.x / width, 0), 1)
                            pending = ((low + Double(fraction) * (high - low)) * 10).rounded() / 10
                        }
                )
            }
            .frame(height: 30)

            Text("Drag the dial, or say it in the Log")
                .font(Theme.font(11)).opacity(0.5)
                .frame(maxWidth: .infinity, alignment: .center)

            LogControl(label: "Log weight", busy: store.busy) {
                Task {
                    await store.logWeight(value)
                    pending = nil
                }
            }
        }
    }
}

// MARK: - Calories

struct CaloriesWidget: View {
    @EnvironmentObject var store: Store
    @State private var composing = false

    var body: some View {
        let target = store.calorieTarget
        let day = store.total(store.today, "calories")
        let eaten = day?.value ?? 0
        let meals = store.entries(on: store.today).filter { $0.moduleSlug == "calories" }

        WidgetCell {
            HStack(alignment: .firstTextBaseline) {
                NavigationLink(value: "calories") { Kicker(icon: .utensils, text: "Calories") }
                    .buttonStyle(.plain)
                Spacer()
                Text(meals.isEmpty ? "no meals yet" : "\(meals.count) meals")
                    .font(Theme.font(11)).opacity(0.5)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Format.group(eaten)).font(Theme.heading(40))
                Text("/ \(Format.group(target))").font(Theme.font(12)).opacity(0.6)
            }

            // One segment per meal in the order eaten, then the shortfall.
            MealBar(meals: meals.reversed().map { $0.value ?? 0 }, remaining: max(target - eaten, 0))

            VStack(spacing: 7) {
                ForEach(meals.reversed()) { meal in
                    HStack {
                        Text(meal.label ?? "Meal").font(Theme.font(13))
                        Spacer()
                        Text(Format.group(meal.value ?? 0)).font(Theme.font(13, .heavy))
                    }
                }
            }

            if !store.savedMeals.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Rule()
                    Kicker(icon: .bookmark, text: "Saved", muted: true)
                    FlowRow(spacing: 6) {
                        ForEach(store.savedMeals.prefix(3)) { meal in
                            Button {
                                Task { await store.logSavedMeal(meal.id) }
                            } label: {
                                HStack(spacing: 6) {
                                    Text(meal.name).font(Theme.font(12, .heavy))
                                    Text(Format.group(meal.kcal)).font(Theme.font(12)).opacity(0.55)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(Theme.ink)
                        }
                    }
                }
            }

            LogControl(label: "Log meal") { composing = true }
        }
        .sheet(isPresented: $composing) {
            // A meal goes through the parser like any other line, so it lands in
            // review rather than straight into the module.
            ParseSheet(prompt: "What did you eat?", placeholder: "turkey sandwich and a bag of chips")
        }
    }
}

// MARK: - Reading

struct ReadingWidget: View {
    @EnvironmentObject var store: Store
    @State private var logging = false

    var body: some View {
        let book = store.currentBook
        let pages = store.total(store.today, "reading")?.value ?? 0

        WidgetCell {
            NavigationLink(value: "reading") { Kicker(icon: .bookOpen, text: "Reading") }
                .buttonStyle(.plain)

            if let book {
                HStack(alignment: .top, spacing: 12) {
                    CoverArt(book: book, width: 56, height: 82)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(book.title).font(Theme.heading(15))
                        if let author = book.author {
                            Text(author).font(Theme.font(12)).opacity(0.6)
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(Format.group(pages)).font(Theme.heading(22))
                            Text("of \(Format.group(store.readingGoal)) pages")
                                .font(Theme.font(11.5)).opacity(0.6)
                        }
                        .padding(.top, 8)
                    }
                    Spacer(minLength: 0)
                }

                if let total = book.totalPages, total > 0 {
                    ProgressRule(fraction: Double(book.currentPage) / Double(total))
                    Text("p. \(Format.group(Double(book.currentPage))) of \(Format.group(Double(total)))")
                        .font(Theme.font(11.5)).opacity(0.6)
                }
            } else {
                Text("No book in progress — add one from the module.")
                    .font(Theme.font(12.5)).opacity(0.6)
            }

            LogControl(label: "Log pages") { logging = true }
        }
        .sheet(isPresented: $logging) {
            ValueSheet(
                title: "Log pages",
                fields: [
                    .init(key: "pages", label: book.map { "Pages read of \($0.title)" } ?? "Pages read", placeholder: "24"),
                    .init(key: "note", label: "Note (optional)", placeholder: "the chestnut section is the hinge"),
                ]
            ) { values in
                guard let pages = Int(values["pages"] ?? "") else { return }
                await store.logPages(pages, note: values["note"])
            }
        }
    }
}

// MARK: - Running, Writing, Sleep

struct RunningWidget: View {
    @EnvironmentObject var store: Store
    @State private var logging = false

    var body: some View {
        let days = Dates.weekDays(Dates.startOfWeek(store.today))
        let week = days.map { store.total($0, "running")?.value ?? 0 }
        let done = week.reduce(0, +)
        let goal = store.goals.first { $0.moduleSlug == "running" && $0.cadence == "weekly" }?.target ?? 20
        let peak = max(week.max() ?? 1, 1)
        let lastRun = store.recentEntries.first { $0.moduleSlug == "running" }

        WidgetCell {
            HStack(alignment: .firstTextBaseline) {
                NavigationLink(value: "running") { Kicker(icon: .run, text: "Running") }
                    .buttonStyle(.plain)
                Spacer()
                Text("this week").font(Theme.font(11)).opacity(0.5)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(String(format: "%.1f", done)).font(Theme.heading(40))
                Text("of \(Int(goal)) \(store.profile?.distanceUnit ?? "mi")")
                    .font(Theme.font(11.5)).opacity(0.6)
            }

            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array(days.enumerated()), id: \.element) { index, date in
                    Rectangle()
                        .fill(week[index] > 0
                              ? (date == store.today ? Theme.accent : Theme.ink)
                              : Theme.ink.opacity(0.1))
                        .frame(height: week[index] > 0 ? max(CGFloat(week[index] / peak) * 38, 4) : 3)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 38, alignment: .bottom)

            if let lastRun {
                let seconds = lastRun.payload["duration_s"]?.intValue
                Text(
                    "Last: \(String(format: "%.1f", lastRun.value ?? 0)) \(lastRun.unit ?? "mi")"
                    + (seconds.map { " · \(Format.duration($0)) pace \(Format.pace(seconds: $0, miles: lastRun.value ?? 0))" } ?? "")
                )
                .font(Theme.font(11)).opacity(0.55)
            }

            LogControl(label: "Log run") { logging = true }
        }
        .sheet(isPresented: $logging) {
            ValueSheet(
                title: "Log run",
                fields: [
                    .init(key: "distance", label: "Distance (\(store.profile?.distanceUnit ?? "mi"))", placeholder: "5.1"),
                    .init(key: "time", label: "Time (mm:ss, optional)", placeholder: "44:20"),
                ]
            ) { values in
                guard let miles = Double(values["distance"] ?? "") else { return }
                let parts = (values["time"] ?? "").split(separator: ":").compactMap { Int($0) }
                let seconds: Int? = parts.count == 3
                    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                    : (parts.count == 2 ? parts[0] * 60 + parts[1] : nil)
                await store.logRun(miles: miles, seconds: seconds)
            }
        }
    }
}

struct WritingWidget: View {
    @EnvironmentObject var store: Store
    @State private var logging = false

    var body: some View {
        let words = store.total(store.today, "writing")?.value ?? 0
        let goal = store.goals.first { $0.moduleSlug == "writing" && $0.cadence == "daily" }?.target ?? 750
        let days = Dates.rangeOfDays(store.today, 14)

        WidgetCell {
            HStack(alignment: .firstTextBaseline) {
                NavigationLink(value: "writing") { Kicker(icon: .pencil, text: "Writing") }
                    .buttonStyle(.plain)
                Spacer()
                Text("words").font(Theme.font(11)).opacity(0.5)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Format.group(words)).font(Theme.heading(40))
                Text("of \(Format.group(goal))").font(Theme.font(11.5)).opacity(0.6)
            }

            HStack(spacing: 3) {
                ForEach(days, id: \.self) { date in
                    let value = store.total(date, "writing")?.value ?? 0
                    Rectangle()
                        .fill(value > 0 ? (date == store.today ? Theme.accent : Theme.ink) : Theme.ink.opacity(0.1))
                        .aspectRatio(1, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                }
            }

            Text("Streak \(Projection.streak(store.series("writing")) { $0 > 0 }) days")
                .font(Theme.font(11)).opacity(0.55)

            LogControl(label: "Log session") { logging = true }
        }
        .sheet(isPresented: $logging) {
            ValueSheet(title: "Log session", fields: [.init(key: "words", label: "Words written", placeholder: "640")]) { values in
                guard let words = Int(values["words"] ?? "") else { return }
                await store.logWords(words)
            }
        }
    }
}

struct SleepWidget: View {
    @EnvironmentObject var store: Store
    @State private var logging = false

    var body: some View {
        let hours = store.total(store.today, "sleep")?.value ?? 0
        let goal = store.goals.first { $0.moduleSlug == "sleep" && $0.cadence == "daily" }?.target ?? 8
        let days = Dates.weekDays(Dates.startOfWeek(store.today))

        WidgetCell {
            HStack(alignment: .firstTextBaseline) {
                NavigationLink(value: "sleep") { Kicker(icon: .bell, text: "Sleep") }
                    .buttonStyle(.plain)
                Spacer()
                Text("hours").font(Theme.font(11)).opacity(0.5)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(String(format: "%.1f", hours)).font(Theme.heading(40))
                Text("of \(Int(goal))").font(Theme.font(11.5)).opacity(0.6)
            }

            HStack(alignment: .bottom, spacing: 4) {
                ForEach(days, id: \.self) { date in
                    let value = store.total(date, "sleep")?.value ?? 0
                    Rectangle()
                        .fill(value > 0 ? Theme.ink : Theme.ink.opacity(0.1))
                        .frame(height: value > 0 ? max(CGFloat(value / (goal * 1.25)) * 34, 4) : 3)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 34, alignment: .bottom)

            LogControl(label: "Log sleep") { logging = true }
        }
        .sheet(isPresented: $logging) {
            ValueSheet(title: "Log sleep", fields: [.init(key: "hours", label: "Hours slept", placeholder: "7.5")]) { values in
                guard let hours = Double(values["hours"] ?? "") else { return }
                await store.logSleep(hours)
            }
        }
    }
}

// MARK: - Goals

struct GoalsPanel: View {
    @EnvironmentObject var store: Store
    var title = "Goals & milestones"

    var body: some View {
        let readouts = GoalReadouts.pick(store.goals, activeSlugs: store.activeSlugs, store: store, slots: 4)
        let ahead = GoalReadouts.upcoming(store.goals, store: store, limit: 3)

        WidgetCell {
            Kicker(icon: .target, text: title, muted: true)

            VStack(alignment: .leading, spacing: 9) {
                ForEach(readouts, id: \.goal.id) { readout in
                    HStack(alignment: .top, spacing: 8) {
                        VectorIcon(Modules.def(readout.goal.moduleSlug).icon, size: 13)
                            .opacity(0.55)
                        Text("\(readout.goal.title) — ").font(Theme.font(12.5)) +
                            Text(readout.progress).font(Theme.font(12.5, .heavy))
                    }
                    .foregroundStyle(readout.accent ? Theme.accent700 : Theme.ink)
                }
            }

            Rule()
            Kicker(icon: .flag, text: "Coming up", muted: true)

            VStack(alignment: .leading, spacing: 7) {
                ForEach(ahead, id: \.label) { item in
                    HStack(alignment: .top, spacing: 8) {
                        Text(Dates.shortDate(item.date))
                            .font(Theme.font(12)).opacity(0.55)
                            .frame(width: 46, alignment: .leading)
                        Text(item.label)
                            .font(Theme.font(12))
                            .foregroundStyle(item.accent ? Theme.accent700 : Theme.ink)
                    }
                }
            }
        }
    }
}

// MARK: - Small shared pieces

/// The day's intake, one segment per meal, then what is left of the target.
struct MealBar: View {
    let meals: [Double]
    let remaining: Double

    private let shades: [Double] = [0.95, 0.75, 0.6, 0.45]

    var body: some View {
        let total = meals.reduce(0, +) + remaining

        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(Array(meals.enumerated()), id: \.offset) { index, value in
                    Rectangle()
                        .fill(Theme.ink.opacity(shades[min(index, shades.count - 1)]))
                        .frame(width: width(for: value, total: total, in: geometry.size.width))
                }
                if remaining > 0 {
                    Rectangle().fill(Theme.ink.opacity(0.12))
                }
            }
        }
        .frame(height: 12)
    }

    private func width(for value: Double, total: Double, in available: CGFloat) -> CGFloat {
        guard total > 0 else { return 0 }
        let gaps = CGFloat(max(meals.count + (remaining > 0 ? 1 : 0) - 1, 0)) * 2
        return max((available - gaps) * CGFloat(value / total), 0)
    }
}

struct ProgressRule: View {
    let fraction: Double
    var over = false

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.ink.opacity(0.12))
                Rectangle()
                    .fill(over ? Theme.accent : Theme.ink)
                    .frame(width: geometry.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 8)
    }
}

struct CoverArt: View {
    let book: Book
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        Group {
            if let raw = book.coverURL, let url = URL(string: raw) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill().grayscale(1)
                } placeholder: {
                    Rectangle().fill(Theme.neutral400)
                }
            } else {
                Rectangle().fill(Theme.neutral400)
                    .overlay(
                        Text(book.title)
                            .font(Theme.font(8))
                            .foregroundStyle(Theme.bg)
                            .padding(4)
                            .multilineTextAlignment(.center)
                    )
            }
        }
        .frame(width: width, height: height)
        .clipped()
    }
}

/// Chips that wrap — the saved-meal row.
struct FlowRow<Content: View>: View {
    var spacing: CGFloat = 6
    @ViewBuilder var content: Content

    var body: some View {
        // iOS 16+ lays this out for us; the chips are few enough that a simple
        // wrapping HStack of fixed-size items is the whole requirement.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: spacing) { content }
            VStack(alignment: .leading, spacing: spacing) { content }
        }
    }
}
