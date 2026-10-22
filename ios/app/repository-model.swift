import SwiftUI

@MainActor
final class RepositoryModel: ObservableObject {
    let repository: GitRepository
    @Published var branches: [GitBranch] = []
    @Published var activeBranch: String
    @Published var branchFilter: Set<String>?
    @Published var authorFilter: Set<String>?
    @Published var commits: [String: GitCommit] = [:]
    @Published var selectedCommit: String?
    @Published var details: CommitDetails?
    @Published var files: [GitFile] = []
    @Published var path = ""
    @Published var error = ""
    @Published var loading = false
    @Published var treeLoading = false
    @Published var hasMore: [String: Bool] = [:]
    private var pages: [String: Int] = [:]
    init(repository: GitRepository, branch: String?) {
        self.repository = repository
        activeBranch = branch ?? repository.defaultBranch
    }
    var ref: String { selectedCommit ?? branches.first(where: { $0.name == activeBranch })?.head ?? "" }
    var rows: [GraphRow] {
        var ids = Set<String>()
        var pending = branches.filter { branchFilter?.contains($0.name) ?? true }.map(\.head)
        while let id = pending.popLast() {
            if ids.insert(id).inserted { pending += commits[id]?.parents ?? [] }
        }
        return CommitGraph.rows(commits.values.filter { ids.contains($0.id) }).filter { authorFilter?.contains($0.commit.author) ?? true }
    }
    func refresh(api: GitAPI) async {
        guard !loading else { return }
        loading = true; error = ""
        defer { loading = false }
        do {
            let next = try await api.branches(repository)
            try Task.checkCancellation()
            branches = next
            if !next.contains(where: { $0.name == activeBranch }) { activeBranch = next.first?.name ?? "" }
            var newCommits: [String: GitCommit] = [:]
            var newPages: [String: Int] = [:]
            var more: [String: Bool] = [:]
            let repository = self.repository
            try await withThrowingTaskGroup(of: (String, HistoryPage).self) { group in
                var iterator = next.makeIterator()
                for _ in 0..<min(4, next.count) {
                    let branch = iterator.next()!
                    group.addTask { (branch.name, try await api.history(repository, ref: branch.head, page: 1)) }
                }
                for try await (branch, page) in group {
                    for commit in page.commits { newCommits[commit.id] = commit }
                    newPages[branch] = 1; more[branch] = page.hasMore
                    if let branch = iterator.next() {
                        group.addTask { (branch.name, try await api.history(repository, ref: branch.head, page: 1)) }
                    }
                }
            }
            commits = newCommits; pages = newPages; hasMore = more
            if let selectedCommit, commits[selectedCommit] == nil { self.selectedCommit = nil; details = nil }
            await loadTree(api: api)
        } catch is CancellationError { return }
        catch { self.error = "\(error.localizedDescription) 已保留上次读取的内容。" }
    }
    func loadMore(api: GitAPI) async {
        guard !loading, hasMore[activeBranch] == true, let branch = branches.first(where: { $0.name == activeBranch }) else { return }
        loading = true
        defer { loading = false }
        do {
            let number = (pages[branch.name] ?? 0) + 1
            let page = try await api.history(repository, ref: branch.head, page: number)
            for commit in page.commits { commits[commit.id] = commit }
            pages[branch.name] = number; hasMore[branch.name] = page.hasMore
        } catch is CancellationError { return }
        catch { self.error = error.localizedDescription }
    }
    func select(_ sha: String, api: GitAPI) async {
        selectedCommit = sha; path = ""; error = ""
        async let tree: Void = loadTree(api: api)
        do {
            let result = try await api.details(repository, sha: sha)
            if selectedCommit == sha { details = result }
        } catch is CancellationError { return }
        catch { if selectedCommit == sha { self.error = error.localizedDescription } }
        await tree
    }
    func loadTree(api: GitAPI) async {
        let source = ref, directory = path
        guard !source.isEmpty else { files = []; return }
        treeLoading = true
        defer { if ref == source && path == directory { treeLoading = false } }
        do {
            let result = try await api.tree(repository, ref: source, path: directory)
            try Task.checkCancellation()
            if ref == source && path == directory { files = result }
        } catch is CancellationError { return }
        catch { if ref == source && path == directory { self.error = error.localizedDescription } }
    }
}
