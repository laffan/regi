import SwiftUI
import UIKit

/// Modernist, warmed — the same tokens the web app takes from `tokens.css`.
/// Flush-left labels, zero corner radius, hairline rules, one clay-red accent.
enum Theme {
    // Colour
    static let bg = Color(hex: 0xFBF8F4)
    static let surface = Color(hex: 0xF4EEE7)
    static let warm = Color(hex: 0xF6F1EA)
    static let ink = Color(hex: 0x2A2320)
    static let line = Color(hex: 0xE6DED4)
    static let divider = Color(hex: 0xE2D9CF)

    static let accent = Color(hex: 0xC8452A)
    static let accent100 = Color(hex: 0xFAEEEA)
    static let accent700 = Color(hex: 0xA1301A)

    static let neutral300 = Color(hex: 0xE2D9CF)
    static let neutral400 = Color(hex: 0xC9BFB4)
    static let neutral500 = Color(hex: 0x9B9797)
    static let neutral700 = Color(hex: 0x605D5D)

    static let bar = Color(hex: 0xE0D7CB)

    // Spacing — the 4pt scale the layouts are drawn on.
    static let s1: CGFloat = 4
    static let s2: CGFloat = 8
    static let s3: CGFloat = 12
    static let s4: CGFloat = 16
    static let s6: CGFloat = 24

    /// Archivo when it is bundled, the system face otherwise. Drop the Archivo
    /// TTFs into the target and add them to UIAppFonts for an exact match.
    static func font(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        if UIFont(name: "Archivo", size: size) != nil {
            let name: String
            switch weight {
            case .heavy, .black, .bold: name = "Archivo-ExtraBold"
            case .semibold: name = "Archivo-SemiBold"
            default: name = "Archivo-Regular"
            }
            if UIFont(name: name, size: size) != nil {
                return .custom(name, size: size)
            }
        }
        return .system(size: size, weight: weight, design: .default)
    }

    static func heading(_ size: CGFloat) -> Font { font(size, .heavy) }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

// MARK: - Shared furniture

/// The uppercase, letter-spaced module label above every widget.
struct Kicker: View {
    let icon: IconName
    let text: String
    var muted = false

    var body: some View {
        HStack(spacing: 6) {
            VectorIcon(icon, size: 13)
            Text(text.uppercased())
                .kerning(1.2)
                .font(Theme.font(10, .heavy))
        }
        .foregroundStyle(muted ? Theme.ink.opacity(0.5) : Theme.accent)
    }
}

/// The one Log control every module widget ends in: full width, flush left,
/// solid accent. Never conditional, never restyled per module.
struct LogControl: View {
    let label: String
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(busy ? "Saving…" : label)
                    .font(Theme.font(15, .heavy))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
            .background(Theme.accent)
            .foregroundStyle(Theme.bg)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }
}

struct Tag: View {
    enum Kind { case accent, neutral, outline }
    let text: String
    var icon: IconName?
    var kind: Kind = .neutral

    var body: some View {
        HStack(spacing: 5) {
            if let icon { VectorIcon(icon, size: 12) }
            Text(text).font(Theme.font(11))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 3)
        .background(background)
        .foregroundStyle(foreground)
        .overlay(kind == .outline ? Rectangle().stroke(Theme.accent, lineWidth: 1) : nil)
    }

    private var background: Color {
        switch kind {
        case .accent: return Theme.accent100
        case .neutral: return Theme.surface
        case .outline: return .clear
        }
    }

    private var foreground: Color {
        switch kind {
        case .accent: return Theme.accent700
        case .neutral: return Theme.ink.opacity(0.8)
        case .outline: return Theme.accent
        }
    }
}

/// A hairline, the way the whole system separates things.
struct Rule: View {
    var body: some View {
        Rectangle().fill(Theme.line).frame(height: 1)
    }
}

/// A widget cell: no border, whitespace and the 1pt grid gap do the work.
struct WidgetCell<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            content
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bg)
    }
}
