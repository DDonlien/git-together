import Foundation
import Testing
@testable import GitTogetherCore

private final class RequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var requests: [URLRequest] = []
    func add(_ request: URLRequest) { lock.withLock { requests.append(request) } }
    var all: [URLRequest] { lock.withLock { requests } }
}
private final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private nonisolated(unsafe) static var handler: (@Sendable (URLRequest) throws -> (Int, [String: String], String))?
    static func configure(_ next: @escaping @Sendable (URLRequest) throws -> (Int, [String: String], String)) { lock.withLock { handler = next } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let handler = Self.lock.withLock { Self.handler! }
            let (status, headers, body) = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@Suite(.serialized)
struct HTTPTests {
    private func http() -> HTTPClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return HTTPClient(session: URLSession(configuration: config))
    }
    private func server() -> PresenceCredentials {
        PresenceCredentials(id: UUID(), url: URL(string: "https://presence.example.com/presence/")!, accountID: "me", identityID: "person", displayName: "Me", issuer: "https://presence.example.com/presence/", sessionToken: "home-token", expiresAt: 5000, deviceID: "phone", deviceToken: "device-token", deviceName: "Phone", enabled: true)
    }
    @Test func paginationKeepsCredentialOnConfiguredOrigin() async throws {
        let log = RequestLog()
        MockURLProtocol.configure { request in
            log.add(request)
            let page = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "page" }!.value
            return page == "1" ? (200, ["Link": "<https://untrusted.example/leak>; rel=\"next\""], "[{\"id\":1}]") : (200, [:], "[]")
        }
        let account = GitAccount(id: UUID(), provider: .github, host: URL(string: "https://github.com")!, login: "me", name: "me")
        let rows = try await GitAPI(account: account, token: "git-token", http: http()).all(["user", "repos"])
        #expect(rows.count == 1 && log.all.count == 2)
        #expect(log.all.allSatisfy { $0.url?.host == "api.github.com" && $0.value(forHTTPHeaderField: "Authorization") == "Bearer git-token" })
    }
    @Test func controllerUsesDeviceTokenAndAnnouncesNoLocalWorkspaces() async throws {
        let log = RequestLog()
        MockURLProtocol.configure { request in log.add(request); return (200, [:], "{\"ok\":true}") }
        try await PresenceAPI(http: http()).announce(server())
        let request = try #require(log.all.first)
        #expect(request.url?.path == "/presence/v1/control/announce")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer device-token")
        let body = try JSONDecoder().decode(JSONValue.self, from: try #require(request.httpBody))
        #expect(body["workspaces"] == .array([]))
        #expect(body["name"].text == "Phone")
    }
    @Test func remoteRequestUsesStrictPublicProtocolAndStableID() async throws {
        let log = RequestLog()
        let requestID = UUID()
        MockURLProtocol.configure { request in
            log.add(request)
            return (201, [:], """
            {"id":"\(requestID.uuidString.lowercased())","deviceId":"desktop","workspaceId":"worktree","repositoryId":"git.example.com/team/repo","action":"commit","kind":"execute","status":"queued","expiresAt":5000,"result":null,"error":""}
            """)
        }
        let server = server()
        let workspace = ControlWorkspace(id: "worktree", repositoryId: "git.example.com/team/repo", worktreeId: "tree", branch: "main", head: String(repeating: "a", count: 40), teamId: "org", scopeVersion: 3, actions: [.commit])
        let device = ControlDevice(deviceId: "desktop", userId: "me", identityId: "person", name: "Mac", online: true, lastSeen: 1000, workspaces: [workspace])
        let target = RemoteTarget(serverID: server.id, device: device, workspace: workspace)
        let job = try await PresenceAPI(http: http()).enqueue(server, target: target, action: .commit, kind: "execute", id: requestID, previewID: "preview", paths: ["a.swift"], summary: "Fix", description: "Details")
        #expect(job.id == requestID.uuidString.lowercased())
        let body = try JSONDecoder().decode(JSONValue.self, from: try #require(log.all.first?.httpBody))
        guard case .object(let values) = body else { Issue.record("Expected request object"); return }
        #expect(Set(values.keys) == ["id", "deviceId", "workspaceId", "repositoryId", "action", "kind", "previewId", "paths", "summary", "description"])
        #expect(body["workspaceId"].text == "worktree")
        #expect(body["paths"] == .strings(["a.swift"]))
    }
    @Test func crossServerIdentityNeverForwardsHomeSession() async throws {
        let log = RequestLog()
        let foreign = URL(string: "https://foreign.example.com/presence/")!
        MockURLProtocol.configure { request in
            log.add(request)
            switch request.url!.path {
            case "/presence/v1/identity/challenge": return (200, [:], "{\"audience\":\"https://foreign.example.com/presence/\",\"nonce\":\"nonce\"}")
            case "/presence/v1/identity/ticket": return (200, [:], "{\"assertion\":\"signed-ticket\",\"delegation\":\"revocation-proof\"}")
            case "/presence/v1/identity/exchange": return (200, [:], """
                {"token":"foreign-session","expiresAt":5000,"account":{"id":"foreign-me","identityId":"person","displayName":"Me","issuer":"https://presence.example.com/presence/"}}
                """)
            case "/presence/v1/control/enroll": return (201, [:], "{\"deviceId\":\"foreign-phone\",\"deviceToken\":\"foreign-device-token\",\"userId\":\"foreign-me\"}")
            default: throw AppFailure.message("Unexpected request")
            }
        }
        let result = try await PresenceAPI(http: http()).addServer(url: foreign, home: server(), name: "Phone")
        #expect(result.deviceID == "foreign-phone" && result.identityID == "person")
        #expect(log.all.filter { $0.url?.host == "foreign.example.com" }.allSatisfy { $0.value(forHTTPHeaderField: "Authorization") != "Bearer home-token" })
        #expect(log.all.first { $0.url?.path.hasSuffix("/ticket") == true }?.value(forHTTPHeaderField: "Authorization") == "Bearer home-token")
        #expect(log.all.last?.value(forHTTPHeaderField: "X-Presence-Account") == "foreign-session")
    }
    @Test func unauthorizedIsAnErrorAndNeverAnEmptyCatalog() async {
        MockURLProtocol.configure { _ in (401, [:], "{\"message\":\"invalid token\"}") }
        await #expect(throws: (any Error).self) { try await http().json(URL(string: "https://git.example.com/api/user")!) }
    }
}
