import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct PresenceAPI: Sendable {
    let http: HTTPClient
    func request(_ base: URL, route: [String], token: String? = nil, body: JSONValue? = nil, accountProof: String? = nil) async throws -> JSONValue {
        var headers = ["X-Presence-Client": "native"]
        if let token { headers["Authorization"] = "Bearer \(token)" }
        if let accountProof { headers["X-Presence-Account"] = accountProof }
        return try await http.json(Endpoint.url(base, ["v1"] + route), method: body == nil ? "GET" : "POST", headers: headers, body: body)
    }
    func login(url: URL, email: String, password: String, name: String) async throws -> PresenceCredentials {
        let session = try await request(url, route: ["account", "login"], body: .object(["email": .string(email), "password": .string(password)]))
        return try await enroll(url: url, session: session, name: name)
    }
    func addServer(url: URL, home: PresenceCredentials, name: String) async throws -> PresenceCredentials {
        let challenge = try await request(url, route: ["identity", "challenge"], body: .object(["issuer": .string(home.issuer)]))
        guard try challenge.string("audience") == url.absoluteString else { throw AppFailure.message("服务器返回了不同的身份接收地址。") }
        let ticket = try await request(home.url, route: ["identity", "ticket"], token: home.sessionToken,
            body: .object(["audience": challenge["audience"], "nonce": challenge["nonce"]]))
        let session = try await request(url, route: ["identity", "exchange"], body: .object(["assertion": ticket["assertion"], "delegation": ticket["delegation"]]))
        guard try session["account"].string("identityId") == home.identityID else { throw AppFailure.message("目标服务器未确认当前账号身份。") }
        return try await enroll(url: url, session: session, name: name)
    }
    private func enroll(url: URL, session: JSONValue, name: String) async throws -> PresenceCredentials {
        let token = try session.string("token")
        let device = try await request(url, route: ["control", "enroll"], token: token,
            body: .object(["name": .string(name)]), accountProof: token)
        guard let expires = session["expiresAt"].number else { throw AppFailure.message("Presence 会话有效期无效。") }
        return PresenceCredentials(id: UUID(), url: url, accountID: try session["account"].string("id"),
            identityID: try session["account"].string("identityId"), displayName: try session["account"].string("displayName"),
            issuer: try session["account"].string("issuer"), sessionToken: token, expiresAt: expires,
            deviceID: try device.string("deviceId"), deviceToken: try device.string("deviceToken"), deviceName: name, enabled: true)
    }
    func control(_ server: PresenceCredentials, route: String, body: JSONValue? = nil) async throws -> JSONValue {
        try await request(server.url, route: ["control", route], token: server.deviceToken, body: body)
    }
    func state(_ server: PresenceCredentials) async throws -> ControlState {
        try JSONDecoder().decode(ControlState.self, from: JSONEncoder().encode(try await control(server, route: "state")))
    }
    func catalogue(_ server: PresenceCredentials, repositories: [String]) async throws {
        _ = try await control(server, route: "catalogue", body: .object(["deviceId": .string(server.deviceID), "repositories": .strings(repositories)]))
    }
    func announce(_ server: PresenceCredentials) async throws {
        _ = try await control(server, route: "announce", body: .object(["name": .string(server.deviceName), "workspaces": .array([])]))
    }
    func enqueue(_ server: PresenceCredentials, target: RemoteTarget, action: RemoteAction, kind: String,
                 id: UUID = UUID(), previewID: String? = nil, previousID: String? = nil,
                 paths: [String]? = nil, summary: String? = nil, description: String? = nil) async throws -> ControlJob {
        guard server.id == target.serverID else { throw AppFailure.message("目标不属于当前服务器。") }
        var body: [String: JSONValue] = ["id": .string(id.uuidString.lowercased()), "deviceId": .string(target.device.deviceId),
            "workspaceId": .string(target.workspace.id), "repositoryId": .string(target.workspace.repositoryId), "action": .string(action.rawValue), "kind": .string(kind)]
        if let previewID { body["previewId"] = .string(previewID) }
        if let previousID { body["previousId"] = .string(previousID) }
        if let paths { body["paths"] = .strings(paths) }
        if let summary { body["summary"] = .string(summary) }
        if let description { body["description"] = .string(description) }
        return try JSONDecoder().decode(ControlJob.self, from: JSONEncoder().encode(try await control(server, route: "requests", body: .object(body))))
    }
    func worlds(_ server: PresenceCredentials) -> AsyncThrowingStream<PresenceWorld, Error> {
        AsyncThrowingStream { continuation in
            var components = URLComponents(url: Endpoint.url(server.url, ["v1", "ws"]), resolvingAgainstBaseURL: false)!
            components.scheme = components.scheme == "https" ? "wss" : "ws"
            var request = URLRequest(url: components.url!)
            request.setValue("Bearer \(server.deviceToken)", forHTTPHeaderField: "Authorization")
            let socket = http.session.webSocketTask(with: request)
            socket.maximumMessageSize = 16 * 1024 * 1024
            let worker = Task {
                socket.resume()
                defer { socket.cancel(with: .goingAway, reason: nil) }
                do {
                    let hello = JSONValue.object(["type": .string("observer"), "version": .number(3), "deviceId": .string(server.deviceID)])
                    try await socket.send(.string(String(decoding: JSONEncoder().encode(hello), as: UTF8.self)))
                    let welcome = try await receive(socket)
                    guard welcome["type"].text == "welcome", welcome["version"].number == 3,
                          let interval = welcome["heartbeatMs"].number, interval >= 50, interval <= 60_000,
                          let ttl = welcome["ttlMs"].number, ttl > interval * 2, ttl <= 600_000 else {
                        throw AppFailure.message("Presence 握手或心跳协议无效。")
                    }
                    let sessionID = try welcome.string("sessionId")
                    try await withThrowingTaskGroup(of: Void.self) { group in
                        group.addTask {
                            while !Task.isCancelled {
                                let heartbeat = JSONValue.object(["type": .string("heartbeat"), "version": .number(3), "sessionId": .string(sessionID)])
                                try await socket.send(.string(String(decoding: JSONEncoder().encode(heartbeat), as: UTF8.self)))
                                try await withCheckedThrowingContinuation { (pong: CheckedContinuation<Void, any Error>) in
                                    socket.sendPing { error in
                                        if let error { pong.resume(throwing: error) }
                                        else { pong.resume() }
                                    }
                                }
                                try await Task.sleep(for: .milliseconds(Int(interval)))
                            }
                        }
                        group.addTask {
                            var revision = -1
                            while !Task.isCancelled {
                                let value = try await receive(socket)
                                guard value["type"].text == "world" else { throw AppFailure.message("Presence 服务器拒绝观察或返回未知消息。") }
                                let world = try JSONDecoder().decode(PresenceWorld.self, from: JSONEncoder().encode(value))
                                guard world.version == 3, world.revision >= revision else { throw AppFailure.message("Presence 快照版本或顺序无效。") }
                                revision = world.revision
                                continuation.yield(world)
                            }
                        }
                        defer { group.cancelAll(); socket.cancel(with: .goingAway, reason: nil) }
                        try await group.next()
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { @Sendable _ in worker.cancel(); socket.cancel(with: .goingAway, reason: nil) }
        }
    }
    private func receive(_ socket: URLSessionWebSocketTask) async throws -> JSONValue {
        let message = try await socket.receive()
        let data: Data
        switch message {
        case .data(let value): data = value
        case .string(let value): data = Data(value.utf8)
        @unknown default: throw AppFailure.message("Presence 消息格式无效。")
        }
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }
}
