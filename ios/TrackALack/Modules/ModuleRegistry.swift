import Foundation

/// Modules describe themselves — the presentation half, mirroring
/// `web/src/modules/registry.ts`. The contract half (publishes, subscribes, how
/// a day rolls up) is the `modules` table, which the app reads at launch.
struct ModuleDef {
    let slug: String
    let name: String
    let icon: IconName
    let unit: String
    let logLabel: String
    let primarySeries: String
    let publishes: [String]
    let subscribes: [String]
}

struct DaySummary {
    var text: String
    /// A rule drawn beside the number, as a fraction of the day's target.
    var barFraction: Double?
    var over = false
    var note: String?
    var isLogged: Bool { text != "not logged" }
}

struct DayContext {
    var calorieTarget: Double = 2200
    var readingGoal: Double = 30
    var bookTitle: String?
    var weightUnit: String = "lb"
}

enum Modules {
    static let all: [String: ModuleDef] = [
        "weight": ModuleDef(
            slug: "weight", name: "Weight", icon: .scale, unit: "lb", logLabel: "Log weight",
            primarySeries: "weight.daily", publishes: ["weight.daily"], subscribes: []
        ),
        "calories": ModuleDef(
            slug: "calories", name: "Calories", icon: .utensils, unit: "kcal", logLabel: "Log meal",
            primarySeries: "calories.daily", publishes: ["calories.daily", "calories.meals"],
            subscribes: ["weight.daily"]
        ),
        "reading": ModuleDef(
            slug: "reading", name: "Reading", icon: .bookOpen, unit: "pages", logLabel: "Log pages",
            primarySeries: "reading.pages", publishes: ["reading.pages", "reading.books"], subscribes: []
        ),
        "running": ModuleDef(
            slug: "running", name: "Running", icon: .run, unit: "mi", logLabel: "Log run",
            primarySeries: "running.miles", publishes: ["running.miles", "running.pace"], subscribes: []
        ),
        "writing": ModuleDef(
            slug: "writing", name: "Writing", icon: .pencil, unit: "words", logLabel: "Log session",
            primarySeries: "writing.words", publishes: ["writing.words"], subscribes: []
        ),
        "sleep": ModuleDef(
            slug: "sleep", name: "Sleep", icon: .bell, unit: "h", logLabel: "Log sleep",
            primarySeries: "sleep.hours", publishes: ["sleep.hours"], subscribes: []
        ),
    ]

    static let order = ["weight", "calories", "reading", "running", "writing", "sleep"]

    static func def(_ slug: String) -> ModuleDef {
        all[slug] ?? all["weight"]!
    }

    static func publisher(of series: String) -> ModuleDef? {
        order.compactMap { all[$0] }.first { $0.publishes.contains(series) }
    }

    /// What a module contributes to one calendar day.
    static func daySummary(_ slug: String, total: DailyTotal?, context: DayContext) -> DaySummary {
        guard let value = total?.value else { return DaySummary(text: "not logged") }

        switch slug {
        case "weight":
            return DaySummary(text: "\(Format.weight(value)) \(total?.unit ?? context.weightUnit)")

        case "calories":
            let over = value > context.calorieTarget
            return DaySummary(
                text: Format.group(value),
                barFraction: min(value / context.calorieTarget, 1),
                over: over,
                note: over
                    ? "over by \(Format.group(value - context.calorieTarget))"
                    : "\(total?.entryCount ?? 0) meal\((total?.entryCount ?? 0) == 1 ? "" : "s")"
            )

        case "reading":
            return DaySummary(
                text: "\(Format.group(value)) pages",
                note: value >= context.readingGoal ? "goal met" : context.bookTitle
            )

        default:
            return DaySummary(text: Format.moduleValue(slug, value, unit: total?.unit))
        }
    }
}

/// Crosstalk widgets: each reads two published series and owns neither.
struct CrosstalkDef: Identifiable {
    let id: String
    let title: String
    let bars: String
    let line: String
    var lineDashed = false
    let requires: [String]
    var footnote: String?
}

enum Crosstalk {
    static let all: [CrosstalkDef] = [
        CrosstalkDef(
            id: "weight-x-calories", title: "Weight × Calories",
            bars: "calories.daily", line: "weight.daily",
            requires: ["weight", "calories"]
        ),
        CrosstalkDef(
            id: "running-x-calories", title: "Running × Calories",
            bars: "calories.daily", line: "running.miles", lineDashed: true,
            requires: ["running", "calories"],
            footnote: "Intake tracks mileage within a day"
        ),
    ]
}
