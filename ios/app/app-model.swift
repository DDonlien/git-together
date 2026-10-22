import SwiftUI

struct PresenceRuntime {
    var state: ControlState?
    var world: PresenceWorld?
    var controlConnected = false
    var worldConnected = false
    var error = ""
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var accounts: [GitAccount] = []
    @Published private(set) var repositories: [GitRepository] = []
    @Published private(set) var pins = Set<String>()
    @Published private(set) var servers: [PresenceCredentials] = []
    @Published private(set) var presence: [UUID: PresenceRuntime] = [:]
    @Published private(set) var accountErrors: [UUID: String] = [:]
    @Published var error = ""
    @Published private(set) var loading = false
    @AppStorage("gittogether.ios.theme") var theme = "system"
    let http = HTTPClient()
    private var polling: [UUID: Task<Void, Never>] = [:]
    private var observing: [UUID: Task<Void, Never>] = [:]
    private var active = false
    private let cacheURL: URL
    private struct Catalog: Codable {
        let accounts: [GitAccount]
        let repositories: [GitRepository]
        let pins: Set<String>
    }
    init() {
        cacheURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("git-together/catalog.json")
        do {
            if FileManager.default.fileExists(atPath: cacheURL.path) {
                let saved = try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: cacheURL))
                accounts = saved.accounts; repositories = saved.repositories; pins = saved.pins
            }
            if let data = try KeychainStore.read("presence.servers") {
                servers = try JSONDecoder().decode([PresenceCredentials].self, from: data)
            }
        } catch { self.error = "读取已保存配置失败：\(error.localizedDescription)" }
    }
    var colorScheme: ColorScheme? { theme == "dark" ? .dark : theme == "light" ? .light : nil }
    var presenceAPI: PresenceAPI { PresenceAPI(http: http) }
    func api(for repo: GitRepository) throws -> GitAPI {
        guard let account = accounts.first(where: { $0.id == repo.accountID }) else { throw AppFailure.message("账号已移除。") }
        return try api(for: account)
    }
    func api(for account: GitAccount) throws -> GitAPI {
        guard let data = try KeychainStore.read("git.\(account.id.uuidString)"), let token = String(data: data, encoding: .utf8) else { throw AppFailure.message("请重新连接 \(account.name) 的访问令牌。") }
        return GitAPI(account: account, token: token, http: http)
    }
    private func saveCatalog() throws {
        try FileManager.default.createDirectory(at: cacheURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(Catalog(accounts: accounts, repositories: repositories, pins: pins)).write(to: cacheURL, options: [.atomic, .completeFileProtection])
    }
    private func saveServers() throws { try KeychainStore.write(JSONEncoder().encode(servers), key: "presence.servers") }
    func connect(provider: GitProvider, host: String, name: String, token: String) async throws {
        let address = try Endpoint.base(provider == .github ? provider.defaultHost : host)
        guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw AppFailure.message("请输入访问令牌。") }
        let temporary = GitAccount(id: UUID(), provider: provider, host: address, login: "", name: name)
        let service = GitAPI(account: temporary, token: token, http: http)
        let identity = try await service.identity()
        guard !accounts.contains(where: { $0.provider == provider && $0.host == address && $0.login == identity.login }) else { throw AppFailure.message("这个账号已连接，请在账号设置中更新访问令牌。") }
        let account = GitAccount(id: temporary.id, provider: provider, host: address, login: identity.login, name: name.isEmpty ? identity.name : name)
        let rows = try await GitAPI(account: account, token: token, http: http).repositories()
        try Task.checkCancellation()
        try KeychainStore.write(Data(token.utf8), key: "git.\(account.id.uuidString)")
        accounts.append(account); repositories += rows
        try saveCatalog()
    }
    func updateAccount(_ account: GitAccount, name: String, token: String) async throws {
        var updated = account
        updated.name = name.isEmpty ? account.login : name
        var rows: [GitRepository]?
        if !token.isEmpty {
            let service = GitAPI(account: updated, token: token, http: http)
            guard try await service.identity().login == account.login else { throw AppFailure.message("新令牌属于其他账号，请单独添加。") }
            rows = try await service.repositories()
        }
        guard let index = accounts.firstIndex(where: { $0.id == account.id }) else { throw AppFailure.message("账号已移除。") }
        if !token.isEmpty { try KeychainStore.write(Data(token.utf8), key: "git.\(account.id.uuidString)") }
        accounts[index] = updated
        if let rows { repositories.removeAll { $0.accountID == account.id }; repositories += rows }
        accountErrors[account.id] = nil
        try saveCatalog()
    }
    func removeAccount(_ account: GitAccount) throws {
        try KeychainStore.delete("git.\(account.id.uuidString)")
        accounts.removeAll { $0.id == account.id }
        repositories.removeAll { $0.accountID == account.id }
        accountErrors[account.id] = nil
        try saveCatalog()
    }
    func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        for account in accounts {
            do {
                let rows = try await api(for: account).repositories()
                try Task.checkCancellation()
                guard accounts.contains(where: { $0.id == account.id }) else { continue }
                repositories.removeAll { $0.accountID == account.id }; repositories += rows
                accountErrors[account.id] = nil
                try saveCatalog()
            } catch is CancellationError { return }
            catch { accountErrors[account.id] = error.localizedDescription }
        }
    }
    func togglePin(_ repo: GitRepository) {
        if !pins.insert(repo.id).inserted { pins.remove(repo.id) }
        do { try saveCatalog() } catch { self.error = error.localizedDescription }
    }
    func loginPresence(url: String, email: String, password: String, name: String) async throws {
        guard servers.isEmpty else { throw AppFailure.message("一个实例只绑定一个 Presence 账号，请先退出。") }
        let base = try presenceURL(url)
        let server = try await presenceAPI.login(url: base, email: email, password: password, name: name)
        servers.append(server)
        try saveServers()
        if active { start(server) }
    }
    func addPresenceServer(url: String, name: String) async throws {
        guard let home = servers.first else { throw AppFailure.message("请先登录 Presence 账号。") }
        let base = try presenceURL(url)
        guard !servers.contains(where: { $0.url == base }) else { throw AppFailure.message("这台服务器已添加。") }
        let server = try await presenceAPI.addServer(url: base, home: home, name: name)
        servers.append(server)
        try saveServers()
        if active { start(server) }
    }
    private func presenceURL(_ input: String) throws -> URL {
        let base = try Endpoint.base(input)
        return URL(string: base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/")!
    }
    func setServerEnabled(_ id: UUID, enabled: Bool) throws {
        guard let index = servers.firstIndex(where: { $0.id == id }) else { return }
        servers[index].enabled = enabled
        try saveServers()
        stop(id)
        if active && enabled { start(servers[index]) }
    }
    func removeServer(_ server: PresenceCredentials) async throws {
        if servers.first?.id == server.id && servers.count > 1 { throw AppFailure.message("请先移除其他服务器，再退出归属账号。") }
        _ = try await presenceAPI.control(server, route: "revoke", body: .object(["deviceId": .string(server.deviceID)]))
        _ = try await presenceAPI.request(server.url, route: ["account", "logout"], token: server.sessionToken, body: .object([:]))
        stop(server.id)
        servers.removeAll { $0.id == server.id }; presence[server.id] = nil
        try saveServers()
    }
    func setActive(_ value: Bool) {
        active = value
        if value { for server in servers where server.enabled { start(server) } }
        else { for id in Array(polling.keys) { stop(id) } }
    }
    func reconnect(_ server: PresenceCredentials) { stop(server.id); if active && server.enabled { start(server) } }
    private func stop(_ id: UUID) {
        polling.removeValue(forKey: id)?.cancel(); observing.removeValue(forKey: id)?.cancel()
        presence[id, default: PresenceRuntime()].controlConnected = false
        presence[id, default: PresenceRuntime()].worldConnected = false
    }
    private func start(_ server: PresenceCredentials) {
        guard polling[server.id] == nil else { return }
        polling[server.id] = Task { [weak self] in
            guard let self else { return }
            var catalogue: [String]?
            var delay = 3
            while !Task.isCancelled {
                do {
                    let ids = Array(Set(repositories.map(\.presenceID))).sorted()
                    if catalogue != ids { try await presenceAPI.catalogue(server, repositories: ids); catalogue = ids }
                    try await presenceAPI.announce(server)
                    let state = try await presenceAPI.state(server)
                    try Task.checkCancellation()
                    presence[server.id, default: PresenceRuntime()].state = state
                    presence[server.id, default: PresenceRuntime()].controlConnected = true
                    presence[server.id, default: PresenceRuntime()].error = ""
                    delay = 3
                } catch is CancellationError { return }
                catch {
                    if Task.isCancelled { return }
                    presence[server.id, default: PresenceRuntime()].controlConnected = false
                    presence[server.id, default: PresenceRuntime()].error = error.localizedDescription
                    delay = min(delay * 2, 60)
                }
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            }
        }
        observing[server.id] = Task { [weak self] in
            guard let self else { return }
            var delay = 3
            while !Task.isCancelled {
                do {
                    for try await world in presenceAPI.worlds(server) {
                        try Task.checkCancellation()
                        presence[server.id, default: PresenceRuntime()].world = world
                        presence[server.id, default: PresenceRuntime()].worldConnected = true
                        delay = 3
                    }
                } catch is CancellationError { return }
                catch {
                    if Task.isCancelled { return }
                    presence[server.id, default: PresenceRuntime()].error = error.localizedDescription
                }
                presence[server.id, default: PresenceRuntime()].worldConnected = false
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                delay = min(delay * 2, 60)
            }
        }
    }
    func worktrees(repositoryID: String? = nil) -> [DeviceWorktree] {
        servers.flatMap { server in
            let runtime = presence[server.id] ?? PresenceRuntime()
            return WorktreeRoster.rows(server: server, state: runtime.state, world: runtime.world,
                controlConnected: runtime.controlConnected, worldConnected: runtime.worldConnected && runtime.controlConnected, repositoryID: repositoryID)
        }
    }
    func server(_ id: UUID) throws -> PresenceCredentials {
        guard let value = servers.first(where: { $0.id == id && $0.enabled }), presence[id]?.controlConnected == true else { throw AppFailure.message("此 Presence 服务器已停用或断开，状态未知。") }
        return value
    }
    func enqueue(target: RemoteTarget, action: RemoteAction, kind: String, id: UUID = UUID(), preview: ControlResult? = nil,
                 previousID: String? = nil, paths: [String]? = nil, summary: String? = nil, description: String? = nil) async throws -> ControlJob {
        let connection = try server(target.serverID)
        let latest = try await presenceAPI.state(connection)
        guard action == .abort || !latest.jobs.contains(where: { $0.deviceId == target.device.deviceId && $0.workspaceId == target.workspace.id && !$0.terminal }) else { throw AppFailure.message("此工作目录已有排队或执行中的请求，请先查询结果。") }
        guard let device = latest.devices.first(where: { $0.deviceId == target.device.deviceId && $0.online }),
              let workspace = device.workspaces.first(where: { $0.id == target.workspace.id && $0.repositoryId == target.workspace.repositoryId && $0.teamId == target.workspace.teamId && $0.scopeVersion == target.workspace.scopeVersion }),
              workspace.actions.contains(action) else { throw AppFailure.message("目标离线或控制范围已变化，请重新查看设备。") }
        if kind == "execute" {
            guard let preview, WorktreeRoster.previewIsValid(preview, for: target, state: latest, now: Date().timeIntervalSince1970 * 1000) else { throw AppFailure.message("预览已过期或目标发生变化，请重新预览。") }
        }
        let job = try await presenceAPI.enqueue(connection, target: target, action: action, kind: kind, id: id,
            previewID: preview?.previewId, previousID: previousID, paths: paths, summary: summary, description: description)
        presence[target.serverID, default: PresenceRuntime()].state = latest
        return job
    }
    func wait(_ initial: ControlJob, serverID: UUID) async throws -> ControlJob {
        var job = initial
        while !job.terminal {
            try Task.checkCancellation()
            guard Date().timeIntervalSince1970 * 1000 < initial.expiresAt + 180_000 else { throw AppFailure.message("等待结果超时；请求已受理，请在执行记录查询，勿重复提交。") }
            try await Task.sleep(for: .seconds(1))
            let state = try await presenceAPI.state(server(serverID))
            presence[serverID, default: PresenceRuntime()].state = state
            if let next = state.jobs.first(where: { $0.id == initial.id }) { job = next }
            else { throw AppFailure.message("此请求已不在当前授权记录中，请刷新设备和组织范围。") }
        }
        return job
    }
    func cancelJob(_ job: ControlJob, serverID: UUID) async throws {
        _ = try await presenceAPI.control(server(serverID), route: "cancel", body: .object(["id": .string(job.id)]))
    }
}
