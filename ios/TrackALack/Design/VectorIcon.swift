import SwiftUI

/// The module marks, drawn from the same path data the web app uses.
///
/// Rather than approximate the design's Lucide marks with SF Symbols, the
/// geometry is shared verbatim: these are the strings out of the canvas, on the
/// same 24×24 grid at the same 1.8 stroke. One source of truth for the marks,
/// two platforms drawing it.
enum IconName: String, CaseIterable {
    case scale, utensils, bookOpen, run, pencil, bell, chart, bookmark, flag, target
    case grid, list, calendar, settings
}

struct VectorIcon: View {
    let name: IconName
    var size: CGFloat = 15
    var lineWidth: CGFloat = 1.8

    init(_ name: IconName, size: CGFloat = 15, lineWidth: CGFloat = 1.8) {
        self.name = name
        self.size = size
        self.lineWidth = lineWidth
    }

    var body: some View {
        Canvas { context, canvasSize in
            let scale = min(canvasSize.width, canvasSize.height) / 24
            var path = Path()
            for command in IconGeometry.paths[name] ?? [] {
                path.addPath(command.path())
            }
            let scaled = path.applying(CGAffineTransform(scaleX: scale, y: scale))
            context.stroke(
                scaled,
                with: .foreground, // takes the view's foregroundStyle, like `stroke: currentColor`
                style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)
            )
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Geometry

enum IconShape {
    case d(String)
    case circle(x: CGFloat, y: CGFloat, r: CGFloat)

    func path() -> Path {
        switch self {
        case .d(let data):
            return SVGPath.parse(data)
        case .circle(let x, let y, let r):
            return Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
        }
    }
}

enum IconGeometry {
    static let paths: [IconName: [IconShape]] = [
        .scale: [
            .d("m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"),
            .d("m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"),
            .d("M7 21h10"),
            .d("M12 3v18"),
            .d("M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"),
        ],
        .utensils: [
            .d("M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"),
            .d("M7 2v20"),
            .d("M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"),
        ],
        .bookOpen: [
            .d("M12 7v14"),
            .d("M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"),
        ],
        .run: [
            .circle(x: 15, y: 4.5, r: 2),
            .d("m11.5 21 1.5-6.5-3-2 1-5 3.5 2.5 3 .5"),
            .d("m7.5 12.5-2.5 2 1 3.5"),
            .d("m14 12 3 3 .5 5"),
        ],
        .pencil: [
            .d("M12 20h9"),
            .d("M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"),
        ],
        .bell: [
            .d("M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"),
            .d("M10.3 21a1.94 1.94 0 0 0 3.4 0"),
        ],
        .chart: [
            .d("M3 3v16a2 2 0 0 0 2 2h16"),
            .d("m19 9-5 5-4-4-3 3"),
        ],
        .bookmark: [
            .d("m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"),
        ],
        .flag: [
            .d("M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z"),
            .d("M4 22v-7"),
        ],
        .target: [
            .circle(x: 12, y: 12, r: 9),
            .circle(x: 12, y: 12, r: 5),
            .circle(x: 12, y: 12, r: 1.5),
        ],
        .grid: [
            .d("M3 3h7v7h-7z"),
            .d("M14 3h7v7h-7z"),
            .d("M3 14h7v7h-7z"),
            .d("M14 14h7v7h-7z"),
        ],
        .list: [
            .d("M8 6h13"), .d("M8 12h13"), .d("M8 18h13"),
            .d("M3 6h1"), .d("M3 12h1"), .d("M3 18h1"),
        ],
        .calendar: [
            .d("M3 4h18v18h-18z"),
            .d("M3 10h18"), .d("M8 2v4"), .d("M16 2v4"),
        ],
        .settings: [
            .circle(x: 12, y: 12, r: 3),
            .d("M12 2v3"), .d("M12 19v3"), .d("M2 12h3"), .d("M19 12h3"),
            .d("m5 5 2 2"), .d("m17 17 2 2"), .d("m19 5-2 2"), .d("m7 17-2 2"),
        ],
    ]
}

// MARK: - A small SVG path reader

/// Enough of the `d` grammar for an icon set: M L H V C S Q T A Z, absolute and
/// relative. Arcs go through the endpoint-to-centre conversion from the SVG
/// specification, which is what the rounded book and bell marks need.
enum SVGPath {
    static func parse(_ d: String) -> Path {
        var path = Path()
        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        var lastCommand: Character = " "

        var scanner = Scanner(string: d)
        scanner.charactersToBeSkipped = CharacterSet(charactersIn: ", \n\r\t")

        func nextNumber() -> CGFloat? {
            guard let value = scanner.scanDouble() else { return nil }
            return CGFloat(value)
        }

        func nextPoint(relative: Bool) -> CGPoint? {
            guard let x = nextNumber(), let y = nextNumber() else { return nil }
            return relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
        }

        while !scanner.isAtEnd {
            var command = lastCommand
            if let letter = scanner.scanCharacter() {
                if letter.isLetter {
                    command = letter
                } else {
                    // An implicit repeat: put the number back and reuse the
                    // previous command, as "m16 16 3-8 3 8" does.
                    scanner.currentIndex = scanner.string.index(before: scanner.currentIndex)
                    command = (lastCommand == "M") ? "L" : (lastCommand == "m" ? "l" : lastCommand)
                    // Nothing repeats after a close; without this a stray number
                    // would spin forever on a command that consumes no input.
                    if command == "Z" || command == "z" || command == " " { break }
                }
            } else {
                break
            }

            let relative = command.isLowercase
            switch Character(command.uppercased()) {
            case "M":
                guard let point = nextPoint(relative: relative) else { break }
                path.move(to: point)
                current = point
                start = point
                lastControl = nil

            case "L":
                guard let point = nextPoint(relative: relative) else { break }
                path.addLine(to: point)
                current = point
                lastControl = nil

            case "H":
                guard let x = nextNumber() else { break }
                let point = CGPoint(x: relative ? current.x + x : x, y: current.y)
                path.addLine(to: point)
                current = point
                lastControl = nil

            case "V":
                guard let y = nextNumber() else { break }
                let point = CGPoint(x: current.x, y: relative ? current.y + y : y)
                path.addLine(to: point)
                current = point
                lastControl = nil

            case "C":
                guard let c1 = nextPoint(relative: relative),
                      let c2 = nextPoint(relative: relative),
                      let end = nextPoint(relative: relative) else { break }
                path.addCurve(to: end, control1: c1, control2: c2)
                current = end
                lastControl = c2

            case "S":
                guard let c2 = nextPoint(relative: relative),
                      let end = nextPoint(relative: relative) else { break }
                let c1 = reflect(lastControl, around: current)
                path.addCurve(to: end, control1: c1, control2: c2)
                current = end
                lastControl = c2

            case "Q":
                guard let control = nextPoint(relative: relative),
                      let end = nextPoint(relative: relative) else { break }
                path.addQuadCurve(to: end, control: control)
                current = end
                lastControl = control

            case "T":
                guard let end = nextPoint(relative: relative) else { break }
                let control = reflect(lastControl, around: current)
                path.addQuadCurve(to: end, control: control)
                current = end
                lastControl = control

            case "A":
                guard let rx = nextNumber(), let ry = nextNumber(),
                      let rotation = nextNumber(),
                      let largeArc = nextNumber(), let sweep = nextNumber(),
                      let end = nextPoint(relative: relative) else { break }
                addArc(
                    to: &path, from: current, to: end,
                    rx: rx, ry: ry, rotation: rotation,
                    largeArc: largeArc != 0, sweep: sweep != 0
                )
                current = end
                lastControl = nil

            case "Z":
                path.closeSubpath()
                current = start
                lastControl = nil

            default:
                break
            }

            lastCommand = command
        }

        return path
    }

    private static func reflect(_ control: CGPoint?, around point: CGPoint) -> CGPoint {
        guard let control else { return point }
        return CGPoint(x: 2 * point.x - control.x, y: 2 * point.y - control.y)
    }

    /// Endpoint parameterisation → centre parameterisation (SVG spec, F.6.5).
    private static func addArc(
        to path: inout Path,
        from: CGPoint,
        to end: CGPoint,
        rx: CGFloat,
        ry: CGFloat,
        rotation: CGFloat,
        largeArc: Bool,
        sweep: Bool
    ) {
        if rx == 0 || ry == 0 || (from.x == end.x && from.y == end.y) {
            path.addLine(to: end)
            return
        }

        var rx = abs(rx)
        var ry = abs(ry)
        let phi = rotation * .pi / 180
        let cosPhi = cos(phi)
        let sinPhi = sin(phi)

        let dx2 = (from.x - end.x) / 2
        let dy2 = (from.y - end.y) / 2
        let x1p = cosPhi * dx2 + sinPhi * dy2
        let y1p = -sinPhi * dx2 + cosPhi * dy2

        // Scale the radii up if they cannot span the two points.
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let scale = sqrt(lambda)
            rx *= scale
            ry *= scale
        }

        let sign: CGFloat = (largeArc != sweep) ? 1 : -1
        let numerator = max(rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, 0)
        let denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let coefficient = denominator == 0 ? 0 : sign * sqrt(numerator / denominator)

        let cxp = coefficient * (rx * y1p / ry)
        let cyp = coefficient * -(ry * x1p / rx)
        let cx = cosPhi * cxp - sinPhi * cyp + (from.x + end.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (from.y + end.y) / 2

        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let dot = ux * vx + uy * vy
            let len = sqrt(ux * ux + uy * uy) * sqrt(vx * vx + vy * vy)
            guard len > 0 else { return 0 }
            let value = min(max(dot / len, -1), 1)
            let result = acos(value)
            return (ux * vy - uy * vx < 0) ? -result : result
        }

        let startAngle = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi }
        if sweep && delta < 0 { delta += 2 * .pi }

        // Flatten into cubic segments of at most a quarter turn each.
        let segments = max(Int(ceil(abs(delta) / (.pi / 2))), 1)
        let step = delta / CGFloat(segments)
        let alpha = 4.0 / 3.0 * tan(step / 4)
        var theta = startAngle
        var point = from

        for _ in 0..<segments {
            let next = theta + step
            let cosT = cos(theta), sinT = sin(theta)
            let cosN = cos(next), sinN = sin(next)

            func onEllipse(_ c: CGFloat, _ s: CGFloat) -> CGPoint {
                CGPoint(
                    x: cx + rx * c * cosPhi - ry * s * sinPhi,
                    y: cy + rx * c * sinPhi + ry * s * cosPhi
                )
            }
            func derivative(_ c: CGFloat, _ s: CGFloat) -> CGPoint {
                CGPoint(
                    x: -rx * s * cosPhi - ry * c * sinPhi,
                    y: -rx * s * sinPhi + ry * c * cosPhi
                )
            }

            let endPoint = onEllipse(cosN, sinN)
            let d1 = derivative(cosT, sinT)
            let d2 = derivative(cosN, sinN)

            path.addCurve(
                to: endPoint,
                control1: CGPoint(x: point.x + alpha * d1.x, y: point.y + alpha * d1.y),
                control2: CGPoint(x: endPoint.x - alpha * d2.x, y: endPoint.y - alpha * d2.y)
            )

            point = endPoint
            theta = next
        }
    }
}
