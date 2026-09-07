import SwiftUI

/// One bar per active module, filled on the days that module was logged. The
/// legend underneath is what makes the bars readable, so the two travel
/// together.
struct WeekStripView: View {
    let days: [String]
    let today: String
    let modules: [ModuleDef]
    let totalFor: (String, String) -> DailyTotal?
    var onSelect: ((String) -> Void)?

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(days.enumerated()), id: \.element) { index, date in
                let isToday = date == today

                VStack(alignment: .leading, spacing: 0) {
                    Text(String(Dates.dowShort(date).prefix(1)))
                        .font(Theme.font(9, .heavy))
                        .kerning(1.2)
                        .opacity(isToday ? 0.9 : 0.55)
                    Text("\(Dates.dayNumber(date))")
                        .font(Theme.heading(20))
                        .padding(.top, 4)

                    HStack(spacing: 4) {
                        ForEach(modules, id: \.slug) { module in
                            let logged = totalFor(date, module.slug)?.value != nil
                            Rectangle()
                                .fill(barColour(logged: logged, isToday: isToday))
                                .frame(height: 5)
                        }
                    }
                    .padding(.top, 10)
                }
                .padding(.horizontal, 4)
                .padding(.top, 8)
                .padding(.bottom, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(isToday ? Theme.accent : Theme.bg)
                .foregroundStyle(isToday ? Theme.bg : Theme.ink)
                .overlay(alignment: .leading) {
                    if index > 0 { Rectangle().fill(Theme.line).frame(width: 1) }
                }
                .contentShape(Rectangle())
                .onTapGesture { onSelect?(date) }
            }
        }
        .background(Theme.bg)
        .overlay(alignment: .top) { Rule() }
        .overlay(alignment: .bottom) { Rule() }
    }

    private func barColour(logged: Bool, isToday: Bool) -> Color {
        if isToday { return logged ? Theme.bg : Theme.bg.opacity(0.35) }
        return logged ? Theme.ink : Theme.ink.opacity(0.16)
    }
}

/// "One bar per module — Weight, Calories, Reading … logged / none"
struct StripLegend: View {
    let modules: [ModuleDef]
    var barHeight: CGFloat = 5
    var leading = "One bar per module —"

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 14) {
                Text(leading).opacity(0.6)
                ForEach(modules, id: \.slug) { module in
                    HStack(spacing: 5) {
                        VectorIcon(module.icon, size: 12)
                        Text(module.name)
                    }
                    .opacity(0.8)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 14) {
                HStack(spacing: 6) {
                    Rectangle().fill(Theme.ink).frame(width: 15, height: barHeight)
                    Text("logged")
                }
                HStack(spacing: 6) {
                    Rectangle().fill(Theme.ink.opacity(0.16)).frame(width: 15, height: barHeight)
                    Text("none")
                }
                Spacer(minLength: 0)
            }
            .opacity(0.6)
        }
        .font(Theme.font(11.5))
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bg)
        .overlay(alignment: .bottom) { Rule() }
    }
}
