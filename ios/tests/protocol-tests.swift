import Foundation
import Testing
@testable import GitTogetherCore

@Suite(.serialized)
struct ProtocolTests {
    private let accountID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    private let repositoryID = "git.example.com:10443/team/repo.git"
    private let head = String(repeating: "a", count: 40)
    private func decode<T: Decodable>(_ type: T.Type, _ text: String) throws -> T { try JSONDecoder().decode(type, from: Data(text.utf8)) }
    private func server(id: UUID = UUID()) -> PresenceCredentials {
        PresenceCredentials(id: id, url: URL(string: "https://presence.example.com/presence/")!, accountID: "me", identityID: "person", displayName: "Me", issuer: "https://presence.example.com/presence/", sessionToken: "home-token", expiresAt: 5000, deviceID: "phone", deviceToken: "device-token", deviceName: "iPhone", enabled: true)
    }
    private func workspace(id: String = "w1", tree: String? = "tree1", team: String? = nil, revision: Int? = nil) -> ControlWorkspace {
        ControlWorkspace(id: id, repositoryId: repositoryID, worktreeId: tree, branch: "main", head: head, teamId: team, scopeVersion: revision, actions: [.commit, .submit, .abort, .discard])
    }
    private func device(_ workspaces: [ControlWorkspace]) -> ControlDevice {
        ControlDevice(deviceId: "desktop", userId: "me", identityId: "person", name: "Mac", online: true, lastSeen: 1000, workspaces: workspaces)
    }
    private func state(_ devices: [ControlDevice]) -> ControlState {
        ControlState(deviceId: "phone", userId: "me", identityId: "person", repositories: [repositoryID], devices: devices, teams: [], jobs: [])
    }
    private func world(trees: [String] = ["tree1", "tree2"], team: String? = nil) -> PresenceWorld {
        PresenceWorld(version: 3, revision: 1, sessions: [PresenceSession(sessionId: "session", userId: "me", identityId: "person", displayName: "Me", deviceId: "desktop", deviceName: "Mac", alive: true, lastSeen: 1000,
            projects: trees.map { PresenceProject(repositoryId: repositoryID, worktreeId: $0, branch: "main", head: head, gitReady: true, unpublishedCommits: 2, organizationId: team,
                files: [PresenceFile(path: "source.swift", git: "dirty", editor: "clean", pending: false, activity: "idle", sources: [])]) })], organizations: [])
    }

    @Test func canonicalRepositoryPreservesPortGitSuffixAndEscaping() throws {
        #expect(RepositoryIdentity.canonical(try Endpoint.base("https://Git.Example.com:10443/Team/Repo.git/")) == repositoryID)
        #expect(RepositoryIdentity.canonical(try Endpoint.base("https://git.example.com/Team/Repo%20One.git")) == "git.example.com/team/repo%20one.git")
        #expect(RepositoryIdentity.canonical(try Endpoint.base("https://git.example.com:443/Team/Repo")) == "git.example.com/team/repo")
    }
    @Test func endpointRejectsCredentialAndInsecureAddresses() {
        for input in ["http://example.com", "https://user:password@example.com", "https://example.com?token=secret", "file:///tmp/repo", "https://example.com/#token"] {
            #expect(throws: (any Error).self) { try Endpoint.base(input) }
        }
        #expect(throws: Never.self) { try Endpoint.base("http://127.0.0.1:8765/presence/") }
    }
    @Test func pathEncodingKeepsSlashesInsideSingleGitLabFileSegment() throws {
        let url = Endpoint.url(try Endpoint.base("https://git.example.com/api/v4"), ["projects", "team/repo", "repository", "files", "src/a #?.swift", "raw"], query: [URLQueryItem(name: "ref", value: "feature/a+b")])
        #expect(url.absoluteString.contains("projects/team%2Frepo/repository/files/src%2Fa%20%23%3F.swift/raw"))
        #expect(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value == "feature/a+b")
    }
    @Test func providersDecodeExistingRepositoryShapes() throws {
        let common = """
        {"id":12,"name":"Repo","full_name":"team/Repo","html_url":"https://git.example.com/team/Repo","private":true,"fork":true,"owner":{"type":"Organization"},"default_branch":"main"}
        """
        for provider in [GitProvider.github, .githubEnterprise, .gitea, .gitee] {
            let api = GitAPI(account: GitAccount(id: accountID, provider: provider, host: URL(string: "https://git.example.com")!, login: "me", name: "me"), token: "test", http: HTTPClient())
            let repo = try api.decodeRepository(decode(JSONValue.self, common))
            #expect(repo.owner == "team" && repo.isPrivate && repo.isFork && repo.ownerIsOrganization == true)
        }
        let gitlab = GitAPI(account: GitAccount(id: accountID, provider: .gitlab, host: URL(string: "https://git.example.com")!, login: "me", name: "me"), token: "test", http: HTTPClient())
        let repo = try gitlab.decodeRepository(decode(JSONValue.self, """
        {"id":9,"name":"Repo","path_with_namespace":"group/sub/Repo","web_url":"https://git.example.com/group/sub/Repo","visibility":"internal","namespace":{"kind":"group"},"default_branch":null}
        """))
        #expect(repo.owner == "group/sub" && repo.isPrivate && repo.defaultBranch.isEmpty)
    }
    @Test func separateWorktreesOnSameBranchStayDistinct() {
        let server = server()
        let state = state([device([workspace(), workspace(id: "w2", tree: "tree2")])])
        let rows = WorktreeRoster.rows(server: server, state: state, world: world(), controlConnected: true, worldConnected: true, repositoryID: repositoryID)
        #expect(rows.count == 2)
        #expect(Set(rows.map(\.id)).count == 2)
        #expect(Set(rows.compactMap { $0.target?.workspace.id }) == ["w1", "w2"])
        #expect(rows.allSatisfy { $0.changedCount == 1 && $0.editorLabel == "编辑器未接入" })
        #expect(WorktreeRoster.rows(server: server, state: state, world: world(), controlConnected: true, worldConnected: true, repositoryID: "other/repo").isEmpty)
    }
    @Test func offlineSnapshotsRetainFactsButCannotExecute() {
        let rows = WorktreeRoster.rows(server: server(), state: state([device([workspace()])]), world: world(trees: ["tree1"]), controlConnected: false, worldConnected: false)
        #expect(rows.count == 1 && rows[0].project?.files.count == 1)
        #expect(rows[0].changedCount == nil && rows[0].target == nil && !rows[0].online)
    }
    @Test func serversAndOrganizationsHaveIndependentIdentity() {
        let one = WorktreeRoster.rows(server: server(), state: nil, world: world(trees: ["tree1"], team: "org1"), controlConnected: false, worldConnected: true)
        let two = WorktreeRoster.rows(server: server(), state: nil, world: world(trees: ["tree1"], team: "org2"), controlConnected: false, worldConnected: true)
        #expect(one.count == 1 && two.count == 1 && one[0].id != two[0].id)
        let wrongScope = WorktreeRoster.rows(server: server(), state: state([device([workspace(team: "org2", revision: 3)])]), world: world(trees: ["tree1"], team: "org1"), controlConnected: true, worldConnected: true)
        #expect(wrongScope.first { $0.organizationID == "org1" }?.target == nil)
    }
    @Test func ambiguousLegacyBranchCannotControlEitherWorktree() {
        let rows = WorktreeRoster.rows(server: server(), state: state([device([workspace(tree: nil), workspace(id: "w2", tree: nil)])]), world: world(), controlConnected: true, worldConnected: true)
        #expect(rows.filter { $0.project != nil }.allSatisfy { $0.target == nil })
    }
    @Test func previewChecksExpiryScopeAndHead() throws {
        let target = RemoteTarget(serverID: UUID(), device: device([workspace(team: "org", revision: 3)]), workspace: workspace(team: "org", revision: 3))
        let result = try decode(ControlResult.self, """
        {"previewId":"00000000-0000-0000-0000-000000000010","expiresAt":5000,"phase":"prepared"}
        """)
        #expect(WorktreeRoster.previewIsValid(result, for: target, state: state([target.device]), now: 1000))
        #expect(!WorktreeRoster.previewIsValid(result, for: target, state: state([target.device]), now: 5000))
        #expect(!WorktreeRoster.previewIsValid(result, for: target, state: state([device([workspace(team: "org", revision: 4)])]), now: 1000))
        let moved = ControlWorkspace(id: "w1", repositoryId: repositoryID, worktreeId: "tree1", branch: "main", head: String(repeating: "b", count: 40), teamId: "org", scopeVersion: 3, actions: [.commit])
        #expect(!WorktreeRoster.previewIsValid(result, for: target, state: state([device([moved])]), now: 1000))
    }
    @Test func mergeGraphRemainsTopologicalWithClockSkew() {
        let a = GitCommit(id: "merge", message: "merge", author: "A", date: "2020", parents: ["left", "right"])
        let b = GitCommit(id: "left", message: "left", author: "A", date: "2030", parents: ["root"])
        let c = GitCommit(id: "right", message: "right", author: "A", date: "2040", parents: ["root"])
        let d = GitCommit(id: "root", message: "root", author: "A", date: "2050", parents: [])
        let rows = CommitGraph.rows([d, b, a, c, a])
        #expect(rows.map(\.id).first == "merge" && rows.map(\.id).last == "root")
        #expect(rows.count == 4 && rows[0].edges.filter(\.joinsCommit).count == 2)
    }
    @Test func commitThenFailedPushDoesNotClaimPushed() throws {
        let job = try decode(ControlJob.self, """
        {"id":"job","deviceId":"desktop","workspaceId":"w1","repositoryId":"repo","action":"submit","kind":"execute","status":"failed","expiresAt":5000,"result":{"phase":"committed","commitId":"abc","pushed":false},"error":"Push失败"}
        """)
        #expect(job.terminal && job.result?.phase == "committed" && job.result?.pushed == false)
        #expect(job.label == "Push失败")
    }
}
