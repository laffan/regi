import Foundation

// MARK: - Loosely typed JSON, for the payload columns

/// `entries.payload`, `log_draft_rows.payload` and `user_modules.settings` are
/// module-shaped, so they stay JSON rather than being flattened into every
/// model.
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var stringValue: String? { if case .string(let value) = self { return value }; return nil }
    var doubleValue: Double? {
        switch self {
        case .number(let value): return value
        case .string(let value): return Double(value)
        default: return nil
        }
    }
    var intValue: Int? { doubleValue.map(Int.init) }
    var objectValue: [String: JSONValue]? { if case .object(let value) = self { return value }; return nil }
    var arrayValue: [JSONValue]? { if case .array(let value) = self { return value }; return nil }

    subscript(key: String) -> JSONValue? { objectValue?[key] }
}

// MARK: - Rows

struct Profile: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    var displayName: String?
    var timeZone: String
    var weightUnit: String
    var distanceUnit: String

    enum CodingKeys: String, CodingKey {
        case id, email
        case displayName = "display_name"
        case timeZone = "time_zone"
        case weightUnit = "weight_unit"
        case distanceUnit = "distance_unit"
    }
}

struct ModuleRow: Codable, Identifiable, Equatable {
    let slug: String
    let name: String
    let icon: String
    let unit: String?
    let valueKind: String
    let primarySeries: String
    let publishes: [String]
    let subscribes: [String]
    let logLabel: String
    let sortOrder: Int

    var id: String { slug }

    enum CodingKeys: String, CodingKey {
        case slug, name, icon, unit, publishes, subscribes
        case valueKind = "value_kind"
        case primarySeries = "primary_series"
        case logLabel = "log_label"
        case sortOrder = "sort_order"
    }
}

struct UserModule: Codable, Identifiable, Equatable {
    let moduleSlug: String
    var active: Bool
    var position: Int
    var settings: [String: JSONValue]

    var id: String { moduleSlug }

    enum CodingKeys: String, CodingKey {
        case moduleSlug = "module_slug"
        case active, position, settings
    }

    var calorieTarget: Double { settings["daily_target"]?.doubleValue ?? 2200 }
    var sourceOrder: [String] {
        settings["source_order"]?.arrayValue?.compactMap(\.stringValue) ?? ["usda", "off"]
    }
}

struct MealItem: Codable, Identifiable, Equatable {
    /// nil until the item is stored; `id` falls back to the name so draft rows
    /// can still be listed.
    var storedId: String?
    var name: String
    var portion: String?
    var kcal: Double?
    var matchSource: String?
    var matchRef: String?

    var id: String { storedId ?? name }

    enum CodingKeys: String, CodingKey {
        case storedId = "id"
        case name, portion, kcal
        case matchSource = "match_source"
        case matchRef = "match_ref"
    }
}

struct Entry: Codable, Identifiable, Equatable {
    let id: String
    let moduleSlug: String
    let occurredAt: String
    let localDate: String
    let value: Double?
    let unit: String?
    let label: String?
    let note: String?
    let payload: [String: JSONValue]
    let source: String
    var items: [MealItem]?

    enum CodingKeys: String, CodingKey {
        case id, value, unit, label, note, payload, source, items
        case moduleSlug = "module_slug"
        case occurredAt = "occurred_at"
        case localDate = "local_date"
    }
}

struct DailyTotal: Codable, Identifiable, Equatable {
    let localDate: String
    let moduleSlug: String
    let value: Double?
    let unit: String?
    let entryCount: Int
    let lastAt: String?

    var id: String { "\(localDate)|\(moduleSlug)" }

    enum CodingKeys: String, CodingKey {
        case value, unit
        case localDate = "local_date"
        case moduleSlug = "module_slug"
        case entryCount = "entry_count"
        case lastAt = "last_at"
    }
}

struct Book: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let author: String?
    let coverURL: String?
    let totalPages: Int?
    let currentPage: Int
    let status: String

    enum CodingKeys: String, CodingKey {
        case id, title, author, status
        case coverURL = "cover_url"
        case totalPages = "total_pages"
        case currentPage = "current_page"
    }
}

struct SavedMeal: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let detail: String?
    let kcal: Double
    let items: [MealItem]
    let uses: Int
}

struct Goal: Codable, Identifiable, Equatable {
    let id: String
    let moduleSlug: String
    let kind: String
    let title: String
    let series: String?
    let target: Double?
    let comparator: String?
    let cadence: String
    let dueOn: String?
    let achievedAt: String?
    let active: Bool

    var isMilestone: Bool { kind == "milestone" }

    enum CodingKeys: String, CodingKey {
        case id, kind, title, series, target, comparator, cadence, active
        case moduleSlug = "module_slug"
        case dueOn = "due_on"
        case achievedAt = "achieved_at"
    }
}

struct Draft: Codable, Identifiable, Equatable {
    let id: String
    let rawText: String
    let status: String
    let parser: String
    let parseError: String?

    enum CodingKeys: String, CodingKey {
        case id, status, parser
        case rawText = "raw_text"
        case parseError = "parse_error"
    }
}

struct DraftRow: Codable, Identifiable, Equatable {
    let id: String
    let draftId: String
    let moduleSlug: String
    var label: String?
    var value: Double?
    let unit: String?
    var occurredAt: String
    var payload: [String: JSONValue]
    let matchNote: String?
    let position: Int

    var items: [MealItem] {
        guard let raw = payload["items"]?.arrayValue else { return [] }
        return raw.compactMap { value in
            guard let object = value.objectValue else { return nil }
            return MealItem(
                storedId: object["id"]?.stringValue,
                name: object["name"]?.stringValue ?? "",
                portion: object["portion"]?.stringValue,
                kcal: object["kcal"]?.doubleValue,
                matchSource: object["match_source"]?.stringValue,
                matchRef: object["match_ref"]?.stringValue
            )
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, label, value, unit, payload, position
        case draftId = "draft_id"
        case moduleSlug = "module_slug"
        case occurredAt = "occurred_at"
        case matchNote = "match_note"
    }
}

struct Connection: Codable, Identifiable, Equatable {
    let id: String
    let status: String
    let otherId: String
    let iRequested: Bool
    let iShare: [String]
    let theyShare: [String]

    enum CodingKeys: String, CodingKey {
        case id, status
        case otherId = "other_id"
        case iRequested = "i_requested"
        case iShare = "i_share"
        case theyShare = "they_share"
    }
}

struct Person: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id, email
        case displayName = "display_name"
    }
}
