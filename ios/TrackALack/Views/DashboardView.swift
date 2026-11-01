import SwiftUI

/// 1c — the same widgets as the web dashboard, stacked natively.
///
/// The screen is a widget host: it reads which modules are active and drops
/// each one's cell into the stack. Nothing here is written per module.
struct DashboardView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(kicker: Dates.dowLong(store.today), title: Dates.dayAndMonth(store.today)) {
                Text("\(store.activeSlugs.count) modules")
                    .font(Theme.font(11))
                    .opacity(0.55)
            }

            WeekStripView(
                days: Dates.weekDays(Dates.startOfWeek(store.today)),
                today: store.today,
                modules: store.activeModules,
                totalFor: { date, slug in store.total(date, slug) }
            )

            if store.loading && store.totals.isEmpty {
                Spacer()
                ProgressView().padding(40)
                Spacer()
            } else {
                ScrollView {
                    VStack(spacing: 1) {
                        ForEach(store.activeSlugs, id: \.self) { slug in
                            ModuleWidget(slug: slug)
                        }

                        GoalsPanel()

                        ForEach(charts) { chart in
                            ChartCell(chart: chart)
                        }
                    }
                    .background(Theme.line)
                }
                .background(Theme.line)
            }
        }
        .background(Theme.warm)
        .refreshable { await store.refresh() }
        .overlay(alignment: .bottom) {
            if let message = store.errorMessage {
                ErrorBanner(message: message)
            }
        }
    }

    /// A crosstalk chart appears when every module it draws on is active.
    private var charts: [CrosstalkDef] {
        Crosstalk.all.filter { chart in
            chart.requires.allSatisfy { store.activeSlugs.contains($0) }
        }
    }
}

struct ChartCell: View {
    @EnvironmentObject var store: Store
    let chart: CrosstalkDef
    var window = 30
    var height: CGFloat = 110

    var body: some View {
        let barModule = Modules.publisher(of: chart.bars)
        let lineModule = Modules.publisher(of: chart.line)
        let domain = Dates.rangeOfDays(store.today, window)

        let bars = barModule.map { store.series($0.slug) } ?? []
        let rawLine = lineModule.map { store.series($0.slug) } ?? []
        // Weight reads as a 7-day mean; a mileage line is drawn as logged.
        let line = lineModule?.slug == "weight" ? Projection.movingMean(rawLine, window: 7) : rawLine

        let milestone = store.goals.first {
            $0.isMilestone && $0.moduleSlug == lineModule?.slug && $0.target != nil
        }

        WidgetCell {
            HStack(alignment: .firstTextBaseline) {
                Kicker(icon: .chart, text: chart.title)
                Spacer()
                Text("\(window) days")
                    .font(Theme.font(10))
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .overlay(Rectangle().stroke(Theme.accent, lineWidth: 1))
                    .foregroundStyle(Theme.accent700)
            }

            CrosstalkChartView(
                domain: domain,
                bars: bars,
                line: line,
                barTarget: chart.bars == "calories.daily" ? store.calorieTarget : nil,
                barTargetLabel: "\(Format.group(store.calorieTarget)) target",
                lineDashed: chart.lineDashed,
                goal: milestone.flatMap { goal in
                    goal.target.map { (target: $0, label: goal.title) }
                },
                height: height
            )

            ChartLegend(
                lineLabel: lineModule?.slug == "weight" ? "\(chart.line), 7-day mean" : chart.line,
                barLabel: chart.bars,
                lineDashed: chart.lineDashed,
                footnote: chart.footnote
            )
        }
    }
}

struct ErrorBanner: View {
    let message: String

    var body: some View {
        Text(message)
            .font(Theme.font(12.5))
            .foregroundStyle(Theme.accent700)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.accent100)
            .overlay(alignment: .leading) { Rectangle().fill(Theme.accent).frame(width: 4) }
    }
}
