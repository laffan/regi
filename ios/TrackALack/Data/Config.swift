import Foundation

/// Where the app points. Fill these in, or set SUPABASE_URL / SUPABASE_ANON_KEY
/// in the scheme's environment (handy for pointing the simulator at a local
/// `supabase start`). The anon key is a public client key — it is safe in the
/// app, because row level security is what actually guards the data.
enum Config {
    static let supabaseURL: URL = {
        let raw = ProcessInfo.processInfo.environment["SUPABASE_URL"]
            ?? (Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String)
            ?? "http://127.0.0.1:54321"
        return URL(string: raw) ?? URL(string: "http://127.0.0.1:54321")!
    }()

    static let supabaseAnonKey: String = {
        ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"]
            ?? (Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String)
            ?? ""
    }()
}
