import Foundation

/// Goals recur, milestones happen once. Both read the published series the
/// widgets read, so a goal never needs its own bookkeeping. Mirrors
/// `web/src/modules/goals.ts`.
enum GoalReadouts {
    struct Readout {
        let goal: Goal
        let progress: String
        let accent: Bool
    }

    struct Upcoming {
        let date: String
        let label: String
        let moduleSlug: String
        let accent: Bool
    }

    struct DayFlag {
        let label: String
        let achieved: Bool
    }

    @MainActor
    static func read(_ goal: Goal, store: Store) -> Readout {
        let series = store.series(goal.moduleSlug)

        if goal.isMilestone {
            // A reading milestone measures the book, not the daily page count.
            if goal.moduleSlug == "reading", let book = store.currentBook, let total = book.totalPages {
                let left = max(total - book.currentPage, 0)
                return Readout(
                    goal: goal,
                    progress: left > 0 ? "\(Format.group(Double(left))) pages to go" : "finished",
                    accent: left <= 60
                )
            }

            if let target = goal.target {
                let recent = Array(series.suffix(30))
                let current = goal.moduleSlug == "weight" ? series.last?.value : Projection.mean(recent)
                if let current {
                    let gap = abs(current - target)
                    let text = goal.moduleSlug == "weight"
                        ? "\(Format.weight(gap)) to go"
                        : "\(Format.group(current)) now — \(Format.group(gap)) to go"
                    return Readout(goal: goal, progress: text, accent: true)
                }
            }

            return Readout(
                goal: goal,
                progress: goal.dueOn.map { "by \(Dates.shortDate($0))" } ?? "set",
                accent: true
            )
        }

        if let target = goal.target, goal.cadence == "daily" {
            let window = Array(series.suffix(7))
            let met = window.filter { meets($0.value, target, goal.comparator) }.count
            return Readout(goal: goal, progress: "\(met) of \(window.isEmpty ? 7 : window.count) days", accent: false)
        }

        if goal.cadence == "weekly" {
            let next = goal.dueOn ?? Dates.addDays(store.today, 7)
            return Readout(goal: goal, progress: "next \(Dates.shortDate(next))", accent: false)
        }

        return Readout(goal: goal, progress: "streak \(Projection.streak(series) { $0 > 0 })", accent: false)
    }

    private static func meets(_ value: Double, _ target: Double, _ comparator: String?) -> Bool {
        switch comparator {
        case "<=": return value <= target
        case ">=": return value >= target
        case "=": return value == target
        default: return value > 0
        }
    }

    /// Recurring goals first, with the last slot kept for the nearest milestone.
    @MainActor
    static func pick(_ goals: [Goal], activeSlugs: [String], store: Store, slots: Int) -> [Readout] {
        let mine = goals.filter { activeSlugs.contains($0.moduleSlug) }
        let recurring = mine.filter { !$0.isMilestone && $0.dueOn == nil }
        let milestones = mine
            .filter { $0.isMilestone && $0.achievedAt == nil }
            .sorted { ($0.dueOn ?? "9999") < ($1.dueOn ?? "9999") }

        let reserved = milestones.isEmpty ? 0 : 1
        let chosen = Array(recurring.prefix(max(slots - reserved, 0))) + Array(milestones.prefix(reserved))
        return chosen.prefix(slots).map { read($0, store: store) }
    }

    /// The Coming up list and the calendar's Ahead band.
    @MainActor
    static func upcoming(_ goals: [Goal], store: Store, limit: Int = 4) -> [Upcoming] {
        var items: [Upcoming] = []

        for goal in goals where goal.achievedAt == nil {
            // A milestone the trend reaches is listed at its projected date —
            // the same marker the chart draws — rather than when it was written.
            let projected = goal.isMilestone && goal.target != nil
                ? Projection.projectToTarget(store.series(goal.moduleSlug), target: goal.target ?? 0)
                : nil

            if let projected {
                items.append(
                    Upcoming(date: projected.date, label: "\(goal.title), projected",
                             moduleSlug: goal.moduleSlug, accent: true)
                )
            } else if let due = goal.dueOn, due >= store.today {
                items.append(
                    Upcoming(
                        date: due,
                        label: goal.cadence == "weekly" ? "\(goal.title), weekly" : goal.title,
                        moduleSlug: goal.moduleSlug,
                        accent: goal.isMilestone
                    )
                )
            }
        }

        return Array(items.sorted { $0.date < $1.date }.prefix(limit))
    }

    /// Dates carrying a goal or milestone, for the calendar.
    static func flagged(_ goals: [Goal]) -> [String: DayFlag] {
        var flags: [String: DayFlag] = [:]
        for goal in goals {
            if let achieved = goal.achievedAt {
                flags[String(achieved.prefix(10))] = DayFlag(label: goal.title, achieved: true)
            } else if let due = goal.dueOn {
                flags[due] = DayFlag(label: goal.title, achieved: false)
            }
        }
        return flags
    }

    /// The milestone the day list pins to today.
    @MainActor
    static func nearestMilestone(_ goals: [Goal], store: Store) -> String? {
        guard let next = goals
            .filter({ $0.isMilestone && $0.achievedAt == nil })
            .sorted(by: { ($0.dueOn ?? "9999") < ($1.dueOn ?? "9999") })
            .first
        else { return nil }

        return "\(next.title) — \(read(next, store: store).progress)"
    }
}
