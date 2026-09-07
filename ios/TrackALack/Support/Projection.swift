import Foundation

struct SeriesPoint: Identifiable, Equatable {
    let date: String
    let value: Double
    var id: String { date }
}

/// The fitted run to a milestone — the dashed segment and the hollow marker on
/// the charts. Mirrors `web/src/lib/projection.ts`, so both platforms estimate
/// the same date from the same numbers.
enum Projection {
    static func movingMean(_ points: [SeriesPoint], window: Int = 7) -> [SeriesPoint] {
        let sorted = points.sorted { $0.date < $1.date }
        return sorted.enumerated().map { index, point in
            let slice = sorted[max(0, index - window + 1)...index]
            let mean = slice.reduce(0) { $0 + $1.value } / Double(slice.count)
            return SeriesPoint(date: point.date, value: mean)
        }
    }

    static func mean(_ points: [SeriesPoint]) -> Double? {
        guard !points.isEmpty else { return nil }
        return points.reduce(0) { $0 + $1.value } / Double(points.count)
    }

    struct Fit {
        let slopePerDay: Double
        let intercept: Double
        let from: String
    }

    static func linearFit(_ points: [SeriesPoint]) -> Fit? {
        guard points.count >= 3 else { return nil }
        let sorted = points.sorted { $0.date < $1.date }
        let from = sorted[0].date

        let xs = sorted.map { Double(Dates.daysBetween(from, $0.date)) }
        let ys = sorted.map(\.value)
        let meanX = xs.reduce(0, +) / Double(xs.count)
        let meanY = ys.reduce(0, +) / Double(ys.count)

        var numerator = 0.0
        var denominator = 0.0
        for index in xs.indices {
            numerator += (xs[index] - meanX) * (ys[index] - meanY)
            denominator += pow(xs[index] - meanX, 2)
        }
        guard denominator != 0 else { return nil }

        let slope = numerator / denominator
        return Fit(slopePerDay: slope, intercept: meanY - slope * meanX, from: from)
    }

    /// Change per week implied by the fit — the widget's "−0.6 / wk".
    static func weeklyRate(_ points: [SeriesPoint]) -> Double? {
        linearFit(points).map { $0.slopePerDay * 7 }
    }

    struct Projected {
        let date: String
        let value: Double
        let days: Int
    }

    /// When the trend reaches `target`, or nil if it does not inside the horizon.
    static func projectToTarget(_ points: [SeriesPoint], target: Double, horizonDays: Int = 180) -> Projected? {
        guard let fit = linearFit(points), fit.slopePerDay != 0,
              let last = points.sorted(by: { $0.date < $1.date }).last else { return nil }

        let lastX = Double(Dates.daysBetween(fit.from, last.date))
        let fitted = fit.intercept + fit.slopePerDay * lastX
        let daysNeeded = (target - fitted) / fit.slopePerDay

        guard daysNeeded > 0, daysNeeded <= Double(horizonDays) else { return nil }
        let days = Int(ceil(daysNeeded))
        return Projected(date: Dates.addDays(last.date, days), value: target, days: days)
    }

    /// Consecutive days, most recent first, that met a test.
    static func streak(_ points: [SeriesPoint], met: (Double) -> Bool) -> Int {
        var count = 0
        for point in points.sorted(by: { $0.date > $1.date }) {
            guard met(point.value) else { break }
            count += 1
        }
        return count
    }
}
