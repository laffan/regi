import Foundation

/// Everything joins on the local calendar day, so the conversions live here and
/// nowhere else. Mirrors `web/src/lib/dates.ts`.
enum Dates {
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2 // Monday, as the week strip is drawn
        return calendar
    }()

    static let isoDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    private static let fractionalTimestamps: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plainTimestamps: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func today() -> String { isoDay.string(from: Date()) }

    static func date(_ iso: String) -> Date {
        isoDay.date(from: iso) ?? Date()
    }

    static func addDays(_ iso: String, _ days: Int) -> String {
        isoDay.string(from: calendar.date(byAdding: .day, value: days, to: date(iso)) ?? Date())
    }

    static func daysBetween(_ from: String, _ to: String) -> Int {
        calendar.dateComponents([.day], from: date(from), to: date(to)).day ?? 0
    }

    static func startOfWeek(_ iso: String) -> String {
        let weekday = calendar.component(.weekday, from: date(iso))
        let shift = (weekday + 5) % 7 // Monday = 0
        return addDays(iso, -shift)
    }

    static func weekDays(_ startISO: String) -> [String] {
        (0..<7).map { addDays(startISO, $0) }
    }

    /// The last `count` days, oldest first, ending on `endISO`.
    static func rangeOfDays(_ endISO: String, _ count: Int) -> [String] {
        (0..<count).map { addDays(endISO, $0 - count + 1) }
    }

    static func timestamp(from iso: String) -> Date {
        fractionalTimestamps.date(from: iso) ?? plainTimestamps.date(from: iso) ?? Date()
    }

    static func isoTimestamp(_ date: Date) -> String {
        plainTimestamps.string(from: date)
    }

    // MARK: Display

    private static let short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    private static let months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    private static let dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    static func dayNumber(_ iso: String) -> Int {
        calendar.component(.day, from: date(iso))
    }

    static func dowShort(_ iso: String) -> String {
        let weekday = calendar.component(.weekday, from: date(iso))
        return dows[(weekday + 5) % 7]
    }

    /// "Monday" — the kicker above the iOS dashboard's date.
    static func dowLong(_ iso: String) -> String {
        let names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        let weekday = calendar.component(.weekday, from: date(iso))
        return names[(weekday + 5) % 7]
    }

    /// "7 September"
    static func dayAndMonth(_ iso: String) -> String {
        "\(dayNumber(iso)) \(monthName(iso))"
    }

    static func monthName(_ iso: String) -> String {
        months[calendar.component(.month, from: date(iso)) - 1]
    }

    /// "14 Sep" — the Coming up and Ahead form.
    static func shortDate(_ iso: String) -> String {
        let day = calendar.component(.day, from: date(iso))
        let month = calendar.component(.month, from: date(iso))
        return "\(day) \(short[month - 1])"
    }

    static func timeOfDay(_ isoTimestamp: String) -> String {
        let date = timestamp(from: isoTimestamp)
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        return String(format: "%02d:%02d", hour, minute)
    }

    /// Day cells for a month grid, Monday first, with leading blanks.
    static func monthGrid(year: Int, month: Int) -> [String?] {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = 1
        guard let first = calendar.date(from: components),
              let range = calendar.range(of: .day, in: .month, for: first) else { return [] }

        let weekday = calendar.component(.weekday, from: first)
        let lead = (weekday + 5) % 7
        let days = range.count

        return Array(repeating: nil, count: lead) + (0..<days).map { offset -> String? in
            isoDay.string(from: calendar.date(byAdding: .day, value: offset, to: first) ?? first)
        }
    }

    struct YearMonth: Identifiable, Hashable {
        let year: Int
        let month: Int
        var id: String { "\(year)-\(month)" }
    }

    /// The `count` months ending with the one containing `iso`, oldest first.
    static func lastMonths(_ iso: String, _ count: Int) -> [YearMonth] {
        let anchor = date(iso)
        return (0..<count).reversed().compactMap { back in
            guard let monthDate = calendar.date(byAdding: .month, value: -back, to: anchor) else { return nil }
            return YearMonth(
                year: calendar.component(.year, from: monthDate),
                month: calendar.component(.month, from: monthDate)
            )
        }
    }

    /// "September" for a year/month pair, without going through a date string.
    static func monthName(year: Int, month: Int) -> String {
        months[max(min(month, 12), 1) - 1]
    }
}
