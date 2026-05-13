//
//  APIClient.swift
//
//  URLSession-based HTTP client that adds the same auth headers Android's
//  `AuthInterceptor` produces (`moduledata`, `bodyhash`, `Timezone`, `deviceInfo`).
//
//  Usage: see `APIService.swift` for typed wrappers.
//

import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case http(Int, String?)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .http(let code, let body): return "HTTP \(code): \(body ?? "")"
        case .decoding(let e): return "Decode error: \(e.localizedDescription)"
        case .transport(let e): return e.localizedDescription
        }
    }
}

enum APIClient {

    static let baseURL = "https://script-distribution-api.onrender.com"

    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 60
        cfg.timeoutIntervalForResource = 120
        return URLSession(configuration: cfg)
    }()

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = []  // compact — matches Gson default
        return e
    }()

    private static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    // MARK: - Public API

    /// GET with no body. `path` is everything after the base URL, e.g. `"/api/sides"`.
    static func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path: path, method: "GET", body: nil)
    }

    /// POST with a Codable body.
    static func post<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        let data = try jsonEncoder.encode(body)
        let json = String(data: data, encoding: .utf8) ?? ""
        return try await request(path: path, method: "POST", body: json)
    }

    /// DELETE with no body.
    static func delete<T: Decodable>(_ path: String) async throws -> T {
        try await request(path: path, method: "DELETE", body: nil)
    }

    // MARK: - Internal

    private static func request<T: Decodable>(
        path: String,
        method: String,
        body: String?
    ) async throws -> T {
        guard let url = URL(string: baseURL + path) else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Build auth headers
        for (k, v) in AuthHeaders.build(body: body) {
            req.setValue(v, forHTTPHeaderField: k)
        }

        if let body = body, !body.isEmpty {
            req.httpBody = body.data(using: .utf8)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.http(0, nil)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, String(data: data, encoding: .utf8))
        }

        // Empty body — return a default decode if possible
        if data.isEmpty {
            if let empty = "{}".data(using: .utf8),
               let decoded = try? jsonDecoder.decode(T.self, from: empty) {
                return decoded
            }
        }

        do {
            return try jsonDecoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}

// MARK: - Auth header builder

/// Builds the four headers sent on every authenticated request.
/// Exposed so SidesWebView can pre-build headers for `URLRequest.load`.
enum AuthHeaders {

    /// Builds `moduledata`, `bodyhash`, `Timezone`, `deviceInfo`.
    static func build(body: String?) -> [String: String] {
        let payload: [String: Any] = [
            "device_id": TokenManager.getDeviceId(),
            "user_id": TokenManager.getUserId().isEmpty
                ? NSNull()
                : TokenManager.getUserId(),
            "time_stamp": Int(Date().timeIntervalSince1970 * 1000)
        ]
        // Compact JSON to match Gson's default output
        let json = (try? JSONSerialization.data(
            withJSONObject: payload,
            options: [.fragmentsAllowed]
        )).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"

        let moduleData = EncryptionUtil.encrypt(json)
        let hash = EncryptionUtil.bodyHash(body: body, moduleData: moduleData)

        return [
            "moduledata": moduleData,
            "bodyhash": hash,
            "Timezone": TimeZone.current.identifier,
            "deviceInfo": TokenManager.deviceInfoHeader()
        ]
    }
}
