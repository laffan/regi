import Foundation

/// A small Supabase client over URLSession: auth, PostgREST and edge functions.
///
/// Written by hand rather than pulled in as a package so the app builds with no
/// dependency resolution at all. It covers exactly what these screens need; if
/// the surface grows, supabase-swift drops in behind the same call sites.
actor Supabase {
    static let shared = Supabase()

    struct Session: Codable {
        let accessToken: String
        let refreshToken: String
        let expiresAt: Date
        let userId: String
        let email: String?

        var isExpired: Bool { expiresAt <= Date().addingTimeInterval(60) }
    }

    enum SupabaseError: LocalizedError {
        case notSignedIn
        case http(status: Int, message: String)
        case decoding(String)

        var errorDescription: String? {
            switch self {
            case .notSignedIn: return "You are signed out."
            case .http(let status, let message): return message.isEmpty ? "Request failed (\(status))" : message
            case .decoding(let detail): return "Unexpected response: \(detail)"
            }
        }
    }

    private let session = URLSession(configuration: .default)
    private let decoder = JSONDecoder()
    private var current: Session?

    private init() {
        if let raw = Keychain.get("session"), let data = raw.data(using: .utf8),
           let stored = try? JSONDecoder().decode(Session.self, from: data) {
            current = stored
        }
    }

    // MARK: - Session

    var signedIn: Bool { current != nil }
    var userId: String? { current?.userId }

    private func store(_ session: Session?) {
        current = session
        if let session, let data = try? JSONEncoder().encode(session),
           let raw = String(data: data, encoding: .utf8) {
            Keychain.set(raw, for: "session")
        } else {
            Keychain.remove("session")
        }
    }

    private struct AuthResponse: Decodable {
        let access_token: String
        let refresh_token: String
        let expires_in: Double
        let user: AuthUser?

        struct AuthUser: Decodable {
            let id: String
            let email: String?
        }
    }

    func signIn(email: String, password: String) async throws {
        let body = ["email": email, "password": password]
        let response: AuthResponse = try await auth(path: "token?grant_type=password", body: body)
        try apply(response)
    }

    func signUp(email: String, password: String, displayName: String) async throws {
        let body: [String: Any] = [
            "email": email,
            "password": password,
            "data": ["display_name": displayName],
        ]
        let response: AuthResponse = try await auth(path: "signup", body: body)
        // A project with confirmations on returns no session; the sign-in screen
        // says so rather than pretending the account is live.
        try? apply(response)
    }

    func signOut() async {
        if let token = current?.accessToken {
            var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("auth/v1/logout"))
            request.httpMethod = "POST"
            request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await session.data(for: request)
        }
        store(nil)
    }

    private func apply(_ response: AuthResponse) throws {
        guard let user = response.user else { throw SupabaseError.notSignedIn }
        store(
            Session(
                accessToken: response.access_token,
                refreshToken: response.refresh_token,
                expiresAt: Date().addingTimeInterval(response.expires_in),
                userId: user.id,
                email: user.email
            )
        )
    }

    private func auth<T: Decodable>(path: String, body: [String: Any]) async throws -> T {
        // `path` carries its own query ("token?grant_type=password"), so the URL
        // is built from the string rather than appendingPathComponent, which
        // would escape the "?".
        guard let url = URL(string: "auth/v1/\(path)", relativeTo: Config.supabaseURL) else {
            throw SupabaseError.decoding("bad auth URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try check(response, data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw SupabaseError.decoding(String(data: data, encoding: .utf8) ?? "\(error)")
        }
    }

    /// Refreshes the access token when it is close to expiry.
    private func validToken() async throws -> String {
        guard let session = current else { throw SupabaseError.notSignedIn }
        guard session.isExpired else { return session.accessToken }

        let response: AuthResponse = try await auth(
            path: "token?grant_type=refresh_token",
            body: ["refresh_token": session.refreshToken]
        )
        try apply(response)
        guard let refreshed = current else { throw SupabaseError.notSignedIn }
        return refreshed.accessToken
    }

    // MARK: - PostgREST

    private func makeRequest(path: String, query: [URLQueryItem] = []) async throws -> URLRequest {
        let token = try await validToken()
        var components = URLComponents(
            url: Config.supabaseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty { components.queryItems = query }

        var request = URLRequest(url: components.url!)
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            var message = ""
            if let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                message = (object["message"] as? String)
                    ?? (object["error_description"] as? String)
                    ?? (object["error"] as? String)
                    ?? ""
            }
            if message.isEmpty {
                message = String(data: data.prefix(300), encoding: .utf8) ?? ""
            }
            throw SupabaseError.http(status: http.statusCode, message: message)
        }
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw SupabaseError.decoding(String(data: data.prefix(400), encoding: .utf8) ?? "\(error)")
        }
    }

    /// `select` with PostgREST filters, e.g.
    /// `["local_date": "gte.2026-08-01", "order": "local_date.desc"]`.
    func select<T: Decodable>(_ table: String, columns: String = "*", filters: [String: String] = [:]) async throws -> [T] {
        var query = [URLQueryItem(name: "select", value: columns)]
        query += filters.map { URLQueryItem(name: $0.key, value: $0.value) }

        var request = try await makeRequest(path: "rest/v1/\(table)", query: query)
        request.httpMethod = "GET"

        let (data, response) = try await session.data(for: request)
        try check(response, data)
        return try decode(data)
    }

    @discardableResult
    func insert<T: Decodable>(_ table: String, values: [String: Any]) async throws -> [T] {
        var request = try await makeRequest(path: "rest/v1/\(table)")
        request.httpMethod = "POST"
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: [values])

        let (data, response) = try await session.data(for: request)
        try check(response, data)
        return try decode(data)
    }

    func update(_ table: String, values: [String: Any], filters: [String: String]) async throws {
        var request = try await request(
            path: "rest/v1/\(table)",
            query: filters.map { URLQueryItem(name: $0.key, value: $0.value) }
        )
        request.httpMethod = "PATCH"
        request.httpBody = try JSONSerialization.data(withJSONObject: values)

        let (data, response) = try await session.data(for: request)
        try check(response, data)
    }

    func upsert(_ table: String, values: [String: Any], onConflict: String) async throws {
        var request = try await request(
            path: "rest/v1/\(table)",
            query: [URLQueryItem(name: "on_conflict", value: onConflict)]
        )
        request.httpMethod = "POST"
        request.setValue("resolution=merge-duplicates", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: [values])

        let (data, response) = try await session.data(for: request)
        try check(response, data)
    }

    func delete(_ table: String, filters: [String: String]) async throws {
        var request = try await request(
            path: "rest/v1/\(table)",
            query: filters.map { URLQueryItem(name: $0.key, value: $0.value) }
        )
        request.httpMethod = "DELETE"

        let (data, response) = try await session.data(for: request)
        try check(response, data)
    }

    /// A database function. `approve_draft`, `log_meal` and the sharing calls
    /// all go through here, so multi-row writes stay in one transaction.
    @discardableResult
    func rpc<T: Decodable>(_ name: String, args: [String: Any] = [:]) async throws -> T {
        var request = try await makeRequest(path: "rest/v1/rpc/\(name)")
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: args)

        let (data, response) = try await session.data(for: request)
        try check(response, data)
        return try decode(data)
    }

    func rpcVoid(_ name: String, args: [String: Any] = [:]) async throws {
        var request = try await makeRequest(path: "rest/v1/rpc/\(name)")
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: args)

        let (data, response) = try await session.data(for: request)
        try check(response, data)
    }

    /// An edge function — `parse-log`, `food-lookup`.
    func invoke<T: Decodable>(_ name: String, body: [String: Any]) async throws -> T {
        var request = try await makeRequest(path: "functions/v1/\(name)")
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try check(response, data)
        return try decode(data)
    }
}
