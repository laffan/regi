import Foundation
import SwiftUI

/// One observable store for the whole app. Every write ends by refreshing the
/// same set of reads, because a single log can move the week strip, the
/// calendar and any widget subscribed to the series it publishes.
@MainActor
final class Store: ObservableObject {
    // Session
    @Published var signedIn = false
    @Published var booting = true

    // Data
    @Published var profile: Profile?
    @Published var catalog: [ModuleRow] = []
    @Published var userModules: [UserModule] = []
    @Published var totals: [DailyTotal] = []
    @Published var recentEntries: [Entry] = []
    @Published var books: [Book] = []
    @Published var savedMeals: [SavedMeal] = []
    @Published var goals: [Goal] = []
    @Published var draft: Draft?
    @Published var draftRows: [DraftRow] = []
    @Published var connections: [Connection] = []
    @Published var people: [String: Person] = [:]

    // UI
    @Published var selectedTab: AppTab = .dashboard
    @Published var loading = false
    @Published var busy = false
    @Published var errorMessage: String?

    let today = Dates.today()
    private let historyDays = 90

    // MARK: - Derived

    var activeSlugs: [String] {
        userModules.filter(\.active).sorted { $0.position < $1.position }.map(\.moduleSlug)
    }

    var activeModules: [ModuleDef] { activeSlugs.map(Modules.def) }

    func userModule(_ slug: String) -> UserModule? {
        userModules.first { $0.moduleSlug == slug }
    }

    var calorieTarget: Double { userModule("calories")?.calorieTarget ?? 2200 }

    var currentBook: Book? { books.first { $0.status == "reading" } }

    var readingGoal: Double {
        goals.first { $0.moduleSlug == "reading" && $0.cadence == "daily" }?.target ?? 30
    }

    var dayContext: DayContext {
        DayContext(
            calorieTarget: calorieTarget,
            readingGoal: readingGoal,
            bookTitle: currentBook?.title,
            weightUnit: profile?.weightUnit ?? "lb"
        )
    }

    func total(_ date: String, _ slug: String) -> DailyTotal? {
        totals.first { $0.localDate == date && $0.moduleSlug == slug }
    }

    func series(_ slug: String) -> [SeriesPoint] {
        totals
            .filter { $0.moduleSlug == slug && $0.value != nil }
            .map { SeriesPoint(date: $0.localDate, value: $0.value ?? 0) }
            .sorted { $0.date < $1.date }
    }

    func entries(on date: String) -> [Entry] {
        recentEntries.filter { $0.localDate == date }
    }

    /// The catalog is the source of truth for the module contract; shout in
    /// debug builds if the bundled definitions have drifted from it.
    private func checkCatalogDrift() {
        #if DEBUG
        for row in catalog {
            guard let def = Modules.all[row.slug] else {
                print("[modules] \(row.slug) is in the catalog but has no client definition")
                continue
            }
            if Set(def.publishes) != Set(row.publishes) || Set(def.subscribes) != Set(row.subscribes) {
                print("[modules] \(row.slug) contract drift — catalog says \(row.publishes)/\(row.subscribes)")
            }
        }
        #endif
    }

    // MARK: - Session

    func bootstrap() async {
        signedIn = await Supabase.shared.signedIn
        if signedIn { await refresh() }
        booting = false
    }

    func signIn(email: String, password: String) async -> String? {
        do {
            try await Supabase.shared.signIn(email: email, password: password)
            signedIn = true
            await refresh()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func signUp(email: String, password: String, displayName: String) async -> String? {
        do {
            try await Supabase.shared.signUp(email: email, password: password, displayName: displayName)
            signedIn = await Supabase.shared.signedIn
            if signedIn { await refresh() }
            return signedIn ? nil : "Account created — confirm the email, then sign in."
        } catch {
            return error.localizedDescription
        }
    }

    func signOut() async {
        await Supabase.shared.signOut()
        signedIn = false
        profile = nil
        totals = []
        recentEntries = []
    }

    // MARK: - Reads

    func refresh() async {
        loading = true
        defer { loading = false }

        let from = Dates.addDays(today, -(historyDays - 1))
        let entriesFrom = Dates.addDays(today, -13)

        do {
            async let profiles: [Profile] = Supabase.shared.select("profiles")
            async let catalogRows: [ModuleRow] = Supabase.shared.select("modules", filters: ["order": "sort_order"])
            async let mine: [UserModule] = Supabase.shared.select("user_modules")
            async let dailies: [DailyTotal] = Supabase.shared.select(
                "daily_module_totals",
                filters: ["local_date": "gte.\(from)", "order": "local_date.desc"]
            )
            async let entries: [Entry] = Supabase.shared.select(
                "entry_feed",
                filters: ["local_date": "gte.\(entriesFrom)", "order": "occurred_at.desc"]
            )
            async let bookRows: [Book] = Supabase.shared.select("books")
            async let meals: [SavedMeal] = Supabase.shared.select("saved_meals", filters: ["order": "uses.desc"])
            async let goalRows: [Goal] = Supabase.shared.select("goals", filters: ["active": "eq.true"])

            profile = try await profiles.first
            catalog = try await catalogRows
            userModules = try await mine
            totals = try await dailies
            recentEntries = try await entries
            books = try await bookRows
            savedMeals = try await meals
            goals = try await goalRows

            checkCatalogDrift()
            await loadDraft()
            await loadConnections()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadDraft() async {
        do {
            let drafts: [Draft] = try await Supabase.shared.select(
                "log_drafts",
                filters: ["status": "eq.pending", "order": "created_at.desc", "limit": "1"]
            )
            draft = drafts.first
            if let draft {
                draftRows = try await Supabase.shared.select(
                    "log_draft_rows",
                    filters: ["draft_id": "eq.\(draft.id)", "order": "position"]
                )
            } else {
                draftRows = []
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadConnections() async {
        do {
            connections = try await Supabase.shared.select("my_connections")
            let ids = connections.map(\.otherId)
            guard !ids.isEmpty else { return }

            let list: [Person] = try await Supabase.shared.select(
                "profiles",
                columns: "id,email,display_name",
                filters: ["id": "in.(\(ids.joined(separator: ",")))"]
            )
            people = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Logging

    private func run(_ work: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do {
            try await work()
            await refresh()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func insertEntry(_ values: [String: Any]) async throws {
        guard let userId = await Supabase.shared.userId else { throw Supabase.SupabaseError.notSignedIn }
        var row = values
        row["user_id"] = userId
        row["occurred_at"] = row["occurred_at"] ?? Dates.isoTimestamp(Date())
        let _: [Entry] = try await Supabase.shared.insert("entries", values: row)
    }

    func logWeight(_ value: Double) async {
        await run {
            try await insertEntry([
                "module_slug": "weight",
                "value": value,
                "unit": profile?.weightUnit ?? "lb",
                "label": Format.weight(value),
            ])
        }
    }

    func logPages(_ pages: Int, note: String?) async {
        await run {
            var payload: [String: Any] = [:]
            if let book = currentBook {
                payload["book_id"] = book.id
                payload["end_page"] = book.currentPage + pages
            }
            var row: [String: Any] = [
                "module_slug": "reading",
                "value": pages,
                "unit": "pages",
                "label": currentBook?.title ?? "Reading",
                "payload": payload,
            ]
            if let note, !note.isEmpty { row["note"] = note }
            try await insertEntry(row)
        }
    }

    func logRun(miles: Double, seconds: Int?) async {
        await run {
            var payload: [String: Any] = [:]
            if let seconds { payload["duration_s"] = seconds }
            try await insertEntry([
                "module_slug": "running",
                "value": miles,
                "unit": profile?.distanceUnit ?? "mi",
                "label": String(format: "%.1f %@", miles, profile?.distanceUnit ?? "mi"),
                "payload": payload,
            ])
        }
    }

    func logWords(_ words: Int) async {
        await run {
            try await insertEntry([
                "module_slug": "writing", "value": words, "unit": "words", "label": "\(words) words",
            ])
        }
    }

    func logSleep(_ hours: Double) async {
        await run {
            try await insertEntry([
                "module_slug": "sleep", "value": hours, "unit": "h",
                "label": String(format: "%.1f h", hours),
            ])
        }
    }

    func logSavedMeal(_ id: String) async {
        await run {
            try await Supabase.shared.rpcVoid("log_saved_meal", args: ["p_saved_meal_id": id])
        }
    }

    // MARK: - The log's parse / review / approve loop

    struct ParseResult: Decodable {
        let parser: String?
        let message: String?
    }

    func parse(_ text: String) async -> String? {
        busy = true
        defer { busy = false }
        do {
            let result: ParseResult = try await Supabase.shared.invoke(
                "parse-log",
                body: ["text": text, "now": Dates.isoTimestamp(Date())]
            )
            await loadDraft()
            return result.message
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func approveDraft() async {
        guard let draft else { return }
        await run {
            let _: [String] = try await Supabase.shared.rpc("approve_draft", args: ["p_draft_id": draft.id])
        }
    }

    func discardDraft() async {
        guard let draft else { return }
        await run {
            try await Supabase.shared.rpcVoid("discard_draft", args: ["p_draft_id": draft.id])
        }
    }

    func updateDraftRow(_ row: DraftRow, label: String? = nil, value: Double? = nil, items: [MealItem]? = nil) async {
        var values: [String: Any] = [:]
        if let label { values["label"] = label }
        if let value { values["value"] = value }
        if let items {
            values["payload"] = payloadWithItems(row.payload, items: items)
            values["value"] = items.compactMap(\.kcal).reduce(0, +)
        }
        guard !values.isEmpty else { return }

        do {
            try await Supabase.shared.update("log_draft_rows", values: values, filters: ["id": "eq.\(row.id)"])
            await loadDraft()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteDraftRow(_ row: DraftRow) async {
        do {
            try await Supabase.shared.delete("log_draft_rows", filters: ["id": "eq.\(row.id)"])
            await loadDraft()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func payloadWithItems(_ payload: [String: JSONValue], items: [MealItem]) -> [String: Any] {
        var object: [String: Any] = [:]
        for (key, value) in payload where key != "items" {
            switch value {
            case .string(let text): object[key] = text
            case .number(let number): object[key] = number
            case .bool(let flag): object[key] = flag
            default: break
            }
        }
        object["items"] = items.map { item -> [String: Any] in
            var encoded: [String: Any] = ["name": item.name]
            if let portion = item.portion { encoded["portion"] = portion }
            if let kcal = item.kcal { encoded["kcal"] = kcal }
            if let source = item.matchSource { encoded["match_source"] = source }
            if let ref = item.matchRef { encoded["match_ref"] = ref }
            return encoded
        }
        return object
    }

    // MARK: - Modules and sharing

    func setModuleActive(_ slug: String, _ active: Bool) async {
        guard let userId = await Supabase.shared.userId else { return }
        await run {
            try await Supabase.shared.upsert(
                "user_modules",
                values: ["user_id": userId, "module_slug": slug, "active": active],
                onConflict: "user_id,module_slug"
            )
        }
    }

    func setSourceOrder(_ order: [String]) async {
        guard let userId = await Supabase.shared.userId else { return }
        var settings: [String: Any] = ["source_order": order]
        settings["daily_target"] = calorieTarget

        await run {
            try await Supabase.shared.update(
                "user_modules",
                values: ["settings": settings],
                filters: ["user_id": "eq.\(userId)", "module_slug": "eq.calories"]
            )
        }
    }

    func findPerson(email: String) async -> Person? {
        do {
            let matches: [Person] = try await Supabase.shared.rpc("find_person", args: ["p_email": email])
            return matches.first
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func requestConnection(email: String) async {
        await run {
            let _: String = try await Supabase.shared.rpc("request_connection", args: ["p_email": email])
        }
    }

    func respond(to connectionId: String, accept: Bool) async {
        await run {
            try await Supabase.shared.rpcVoid(
                "respond_to_connection",
                args: ["p_connection_id": connectionId, "p_accept": accept]
            )
        }
    }

    func setShare(connectionId: String, slug: String, granted: Bool) async {
        await run {
            try await Supabase.shared.rpcVoid(
                "set_module_share",
                args: ["p_connection_id": connectionId, "p_module_slug": slug, "p_granted": granted]
            )
        }
    }

    func removeConnection(_ id: String) async {
        await run {
            try await Supabase.shared.delete("connections", filters: ["id": "eq.\(id)"])
        }
    }
}
