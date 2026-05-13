//
//  RealtimeManager.swift
//
//  Tiny WebSocket client for backend real-time events. Uses URLSessionWebSocketTask
//  so there's no third-party dependency.
//
//  Backend exposes /ws and broadcasts JSON messages of shape:
//      { "event": "sides:updated", "data": { ... } }
//
//  Subscribers register a handler closure via `addListener(_:)`. Reconnect is
//  automatic with exponential backoff while at least one listener is attached.
//

import Foundation

final class RealtimeManager {

    static let shared = RealtimeManager()

    typealias Handler = (_ event: String, _ data: [String: Any]) -> Void

    private final class Subscription {
        let id = UUID()
        let handler: Handler
        init(_ h: @escaping Handler) { handler = h }
    }

    private var subscriptions: [Subscription] = []
    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var attempts = 0
    private var connecting = false
    private let queue = DispatchQueue(label: "RealtimeManager", qos: .utility)

    private init() {}

    @discardableResult
    func addListener(_ handler: @escaping Handler) -> UUID {
        let sub = Subscription(handler)
        queue.async {
            self.subscriptions.append(sub)
            self.connectIfNeeded()
        }
        return sub.id
    }

    func removeListener(_ id: UUID) {
        queue.async {
            self.subscriptions.removeAll { $0.id == id }
        }
    }

    private func wsURL() -> URL? {
        let base = APIClient.baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        return URL(string: base + "/ws")
    }

    private func connectIfNeeded() {
        guard task == nil, !connecting, !subscriptions.isEmpty else { return }
        guard let url = wsURL() else { return }
        connecting = true

        let session = URLSession(configuration: .default)
        self.session = session
        let task = session.webSocketTask(with: url)
        self.task = task
        task.resume()
        connecting = false
        attempts = 0
        listen()
        sendPing()
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure:
                self.handleDisconnect()
            case .success(let message):
                let text: String? = {
                    switch message {
                    case .string(let s): return s
                    case .data(let d):   return String(data: d, encoding: .utf8)
                    @unknown default:    return nil
                    }
                }()
                if let text = text { self.dispatch(text: text) }
                self.listen()
            }
        }
    }

    private func dispatch(text: String) {
        guard
            let data = text.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let event = json["event"] as? String
        else { return }
        let payload = (json["data"] as? [String: Any]) ?? [:]
        let subs = queue.sync { subscriptions }
        DispatchQueue.main.async {
            for s in subs { s.handler(event, payload) }
        }
    }

    private func sendPing() {
        task?.sendPing { [weak self] error in
            if error != nil { self?.handleDisconnect(); return }
            // Schedule next ping in 30s.
            self?.queue.asyncAfter(deadline: .now() + 30) { self?.sendPing() }
        }
    }

    private func handleDisconnect() {
        queue.async {
            self.task?.cancel(with: .goingAway, reason: nil)
            self.task = nil
            self.session?.invalidateAndCancel()
            self.session = nil
            guard !self.subscriptions.isEmpty else { return }
            let delay = min(30.0, pow(2.0, Double(self.attempts)))
            self.attempts += 1
            self.queue.asyncAfter(deadline: .now() + delay) {
                self.connectIfNeeded()
            }
        }
    }
}
