import Foundation

/// Number shapes shared with the web app (`web/src/lib/format.ts`).
enum Format {
    private static let grouped: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter
    }()

    static func group(_ value: Double) -> String {
        grouped.string(from: NSNumber(value: value.rounded())) ?? "\(Int(value.rounded()))"
    }

    static func weight(_ value: Double) -> String {
        String(format: "%.1f", value)
    }

    static func signed(_ value: Double, digits: Int = 1) -> String {
        let sign = value > 0 ? "+" : (value < 0 ? "−" : "")
        return sign + String(format: "%.\(digits)f", abs(value))
    }

    /// How a module's day value reads in a summary line.
    static func moduleValue(_ slug: String, _ value: Double?, unit: String?) -> String {
        guard let value else { return "not logged" }
        switch slug {
        case "weight": return "\(weight(value)) \(unit ?? "lb")"
        case "calories": return group(value)
        case "reading": return "\(group(value)) pages"
        case "running": return String(format: "%.1f %@", value, unit ?? "mi")
        case "writing": return "\(group(value)) words"
        case "sleep": return String(format: "%.1f h", value)
        default: return group(value)
        }
    }

    static func duration(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
    }

    static func pace(seconds: Int, miles: Double) -> String {
        guard miles > 0 else { return "—" }
        let perMile = Double(seconds) / miles
        return String(format: "%d:%02d", Int(perMile / 60), Int(perMile.truncatingRemainder(dividingBy: 60)))
    }
}
