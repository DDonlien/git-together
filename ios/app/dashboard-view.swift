import SwiftUI

struct FilterOption: Identifiable { let id: String; let label: String }
struct MultiFilter: View {
    let title: String
    let options: [FilterOption]
    @Binding var selection: Set<String>?
    var body: some View {
        Menu {
            Button("全部", systemImage: selection == nil ? "checkmark.circle.fill" : "circle") { selection = nil }
            Button("取消全选") { selection = [] }
            ForEach(options) { option in
                Button(option.label, systemImage: selection?.contains(option.id) ?? true ? "checkmark.square.fill" : "square") {
                    var next = selection ?? Set(options.map(\.id))
                    if !next.insert(option.id).inserted { next.remove(option.id) }
                    selection = next
                }
            }
        } label: {
            Label(selection.map { "\(title) · \($0.count)" } ?? title, systemImage: "line.3.horizontal.decrease")
        }.menuActionDismissBehavior(.disabled).buttonStyle(M3ButtonStyle())
    }
}

struct DashboardView: View {
    let search: String
    @EnvironmentObject private var model: AppModel
    @State private var accountFilter: Set<String>?
    @State private var ownerFilter: Set<String>?
    @State private var visibility = "全部"
    @State private var repositoryType = "全部"
    @State private var sort = "名称"
    @State private var expanded = Set<String>()
    @State private var addingAccount = false
    private var filtered: [GitRepository] {
        let needle = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return model.repositories.filter { repo in
            (accountFilter?.contains(repo.accountID.uuidString) ?? true)
            && (ownerFilter?.contains(repo.owner) ?? true)
            && (visibility == "全部" || (visibility == "私有") == repo.isPrivate)
            && (repositoryType == "全部" || (repositoryType == "Fork") == repo.isFork)
            && (needle.isEmpty || [repo.name, repo.fullName, repo.description, model.accounts.first { $0.id == repo.accountID }?.name ?? ""].contains { $0.localizedCaseInsensitiveContains(needle) })
        }.sorted {
            let a = model.pins.contains($0.id), b = model.pins.contains($1.id)
            if a != b { return a }
            if sort == "最近更新", $0.updatedAt != $1.updatedAt { return ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }
            return $0.fullName.localizedStandardCompare($1.fullName) == .orderedAscending
        }
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        MultiFilter(title: "账号", options: model.accounts.map { FilterOption(id: $0.id.uuidString, label: $0.name) }, selection: $accountFilter)
                        MultiFilter(title: "组织 / 用户", options: Set(model.repositories.map(\.owner)).sorted().map { FilterOption(id: $0, label: $0) }, selection: $ownerFilter)
                        Menu { Picker("可见性", selection: $visibility) { ForEach(["全部", "公开", "私有"], id: \.self) { Text($0) } } } label: { Text("可见性 · \(visibility)") }.buttonStyle(M3ButtonStyle())
                        Menu { Picker("类型", selection: $repositoryType) { ForEach(["全部", "来源", "Fork"], id: \.self) { Text($0) } } } label: { Text("类型 · \(repositoryType)") }.buttonStyle(M3ButtonStyle())
                    }
                }.scrollIndicators(.hidden)
                HStack {
                    Text("\(filtered.count) 个仓库").font(.subheadline).foregroundStyle(M3.muted)
                    Spacer()
                    Menu { Picker("排序", selection: $sort) { Text("名称").tag("名称"); Text("最近更新").tag("最近更新") } } label: { Label(sort, systemImage: "arrow.up.arrow.down") }.buttonStyle(M3ButtonStyle())
                }
                ForEach(model.accounts) { account in
                    if let error = model.accountErrors[account.id] { Notice(text: "\(account.name)：\(error) 显示上次读取的仓库。") }
                }
                if model.accounts.isEmpty {
                    EmptyState(title: "连接代码托管账号", symbol: "network", message: "汇集不同账号下的仓库，不克隆也能了解远端。")
                    Button("添加账号") { addingAccount = true }.buttonStyle(M3ButtonStyle(filled: true))
                } else if filtered.isEmpty {
                    EmptyState(title: "没有匹配的仓库", symbol: "folder.badge.questionmark", message: "调整搜索或筛选条件，或下拉刷新账号目录。")
                }
                ForEach(filtered) { repo in
                    M3Card {
                        HStack(alignment: .top, spacing: 10) {
                            Button {
                                if !expanded.insert(repo.id).inserted { expanded.remove(repo.id) }
                            } label: { Image(systemName: expanded.contains(repo.id) ? "folder.fill" : "folder").font(.title2).frame(width: 44, height: 44) }
                                .accessibilityLabel("\(expanded.contains(repo.id) ? "收起" : "展开") \(repo.name) 的分支")
                            NavigationLink(value: repo) {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(repo.name).font(.headline).foregroundStyle(M3.text)
                                    Text(repo.fullName).font(.caption).foregroundStyle(M3.muted)
                                }.frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                            }.buttonStyle(.plain)
                            Button { model.togglePin(repo) } label: { Image(systemName: model.pins.contains(repo.id) ? "pin.fill" : "pin").frame(width: 44, height: 44) }
                                .accessibilityLabel(model.pins.contains(repo.id) ? "取消置顶 \(repo.name)" : "置顶 \(repo.name)")
                        }
                        if !repo.description.isEmpty { Text(repo.description).font(.subheadline).foregroundStyle(M3.muted) }
                        ViewThatFits(in: .horizontal) {
                            HStack { metadata(repo) }
                            VStack(alignment: .leading) { metadata(repo) }
                        }
                        let worktrees = model.worktrees(repositoryID: repo.presenceID)
                        if !worktrees.isEmpty {
                            NavigationLink { RepositoryView(repository: repo, initialPane: "设备") } label: {
                                Label("\(Set(worktrees.map { "\($0.serverID):\($0.deviceID)" }).count) 台设备 · \(worktrees.count) 个 worktree", systemImage: "desktopcomputer")
                            }.buttonStyle(M3ButtonStyle())
                        }
                        if expanded.contains(repo.id) { QuickBranches(repository: repo) }
                    }
                }
            }.padding(16).padding(.bottom, 16)
        }
        .background(M3.background).navigationTitle("Dashboard").navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if model.loading { ProgressView().accessibilityLabel("正在读取仓库") }
                else { Button("添加账号", systemImage: "plus") { addingAccount = true } }
            }
        }
        .sheet(isPresented: $addingAccount) { AccountEditor(account: nil) }
        .navigationDestination(for: GitRepository.self) { RepositoryView(repository: $0) }
    }
    @ViewBuilder private func metadata(_ repo: GitRepository) -> some View {
        Chip(text: repo.isPrivate ? "私有" : "公开")
        Chip(text: repo.isFork ? "Fork" : "来源")
        Chip(text: "远端")
        if let account = model.accounts.first(where: { $0.id == repo.accountID }) { Text("\(account.name) · \(account.provider.label)").font(.caption).foregroundStyle(M3.muted) }
    }
}

private struct QuickBranches: View {
    let repository: GitRepository
    @EnvironmentObject private var model: AppModel
    @State private var branches: [GitBranch] = []
    @State private var error = ""
    @State private var loading = true
    var body: some View {
        VStack(alignment: .leading) {
            if loading { ProgressView("正在读取远端分支…") }
            if !error.isEmpty { Notice(text: error) }
            ForEach(branches) { branch in
                NavigationLink { RepositoryView(repository: repository, initialBranch: branch.name) } label: {
                    Label(branch.name, systemImage: "arrow.triangle.branch").frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                }
            }
            if !loading && branches.isEmpty && error.isEmpty { Text("这个仓库尚无远端分支。").font(.subheadline) }
        }.task {
            do { branches = try await model.api(for: repository).branches(repository) }
            catch is CancellationError { return }
            catch { self.error = error.localizedDescription }
            loading = false
        }
    }
}
