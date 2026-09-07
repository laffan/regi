import SwiftUI

/// The chart that owns neither of its series: one module's bars, another's
/// line, and the fitted dashed run to a milestone marker.
struct CrosstalkChartView: View {
    let domain: [String]
    let bars: [SeriesPoint]
    let line: [SeriesPoint]
    var barTarget: Double?
    var barTargetLabel: String?
    var lineDashed = false
    var goal: (target: Double, label: String)?
    var height: CGFloat = 120

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let baseY = geometry.size.height - 10
            let topY: CGFloat = 14

            let barsIn = bars.filter { domain.contains($0.date) }
            let lineIn = line.filter { domain.contains($0.date) }

            let slot = width / CGFloat(max(domain.count, 1))
            let barMax = max(barsIn.map(\.value).max() ?? 1, barTarget ?? 0, 1)

            let lineValues = lineIn.map(\.value)
            let lowest = min(lineValues.min() ?? 0, goal?.target ?? .greatestFiniteMagnitude)
            let highest = max(lineValues.max() ?? 1, goal?.target ?? -.greatestFiniteMagnitude)
            let span = max(highest - lowest, 0.5)

            func x(_ date: String) -> CGFloat {
                CGFloat(domain.firstIndex(of: date) ?? 0) * slot + slot / 2
            }
            func barY(_ value: Double) -> CGFloat {
                baseY - CGFloat(value / barMax) * (baseY - topY - 20)
            }
            func lineY(_ value: Double) -> CGFloat {
                topY + CGFloat((highest - value) / span) * (baseY - topY - 44)
            }

            ZStack(alignment: .topLeading) {
                // Daily bars — the subscribed series drawn as texture.
                Path { path in
                    for point in barsIn {
                        let top = barY(point.value)
                        path.addRect(
                            CGRect(x: x(point.date) - slot * 0.35, y: top, width: slot * 0.7, height: max(baseY - top, 0))
                        )
                    }
                }
                .fill(Theme.bar)

                // The target rule, dashed in accent.
                if let barTarget {
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: barY(barTarget)))
                        path.addLine(to: CGPoint(x: width, y: barY(barTarget)))
                    }
                    .stroke(Theme.accent, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))

                    if let barTargetLabel {
                        Text(barTargetLabel)
                            .font(Theme.font(10))
                            .foregroundStyle(Theme.accent700)
                            .offset(x: 2, y: barY(barTarget) - 14)
                    }
                }

                // The trend line.
                if lineIn.count > 1 {
                    Path { path in
                        for (index, point) in lineIn.enumerated() {
                            let position = CGPoint(x: x(point.date), y: lineY(point.value))
                            if index == 0 { path.move(to: position) } else { path.addLine(to: position) }
                        }
                    }
                    .stroke(
                        lineDashed ? Theme.ink : Theme.accent,
                        style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round,
                                           dash: lineDashed ? [6, 4] : [])
                    )
                }

                // The projection: dashed to a hollow marker at the goal value.
                if let goal, let last = lineIn.last,
                   let projected = Projection.projectToTarget(lineIn, target: goal.target) {
                    let endPoint = CGPoint(x: width - 6, y: lineY(goal.target))

                    Path { path in
                        path.move(to: CGPoint(x: x(last.date), y: lineY(last.value)))
                        path.addLine(to: endPoint)
                    }
                    .stroke(Theme.accent.opacity(0.65), style: StrokeStyle(lineWidth: 2, dash: [5, 5]))

                    Circle()
                        .fill(Theme.bg)
                        .overlay(Circle().stroke(Theme.accent, lineWidth: 2))
                        .frame(width: 9, height: 9)
                        .position(endPoint)

                    Text("\(goal.label) · est. \(Dates.shortDate(projected.date))")
                        .font(Theme.font(10.5, .heavy))
                        .foregroundStyle(Theme.accent700)
                        .position(x: width - 70, y: max(lineY(goal.target) - 14, 10))
                }

                // Baseline.
                Path { path in
                    path.move(to: CGPoint(x: 0, y: baseY))
                    path.addLine(to: CGPoint(x: width, y: baseY))
                }
                .stroke(Theme.neutral300, lineWidth: 1.5)

                if let first = domain.first, let last = domain.last {
                    HStack {
                        Text(Dates.shortDate(first))
                        Spacer()
                        Text(Dates.shortDate(last))
                    }
                    .font(Theme.font(10.5))
                    .opacity(0.55)
                    .offset(y: baseY + 2)
                }
            }
        }
        .frame(height: height)
    }
}

/// The line under a chart saying which series is which.
struct ChartLegend: View {
    let lineLabel: String
    let barLabel: String
    var lineDashed = false
    var footnote: String?

    var body: some View {
        HStack(spacing: 16) {
            HStack(spacing: 5) {
                Rectangle()
                    .fill(lineDashed ? Theme.ink : Theme.accent)
                    .frame(width: 12, height: 2.5)
                Text(lineLabel)
            }
            HStack(spacing: 5) {
                Rectangle().fill(Theme.bar).frame(width: 10, height: 10)
                Text(barLabel)
            }
            Spacer(minLength: 0)
            if let footnote { Text(footnote) }
        }
        .font(Theme.font(11))
        .opacity(0.7)
    }
}
