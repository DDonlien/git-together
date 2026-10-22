import SwiftUI

struct RepositoryView: View {
    let repository: GitRepository
    @StateObject private var workspace: RepositoryModel
    @EnvironmentObject private var app: AppModel
    @State private var pane: String
    @State private var openedFile: GitFile?
    @State private var fileRef = ""
    init(repository: GitRepository, initialBranch: String? = nil, initialPane: String = "Graph") {
        self.repository = repository
        _workspace = StateObject(wrappedValue: RepositoryModel(repository: repository, branch: initialBranch))
        _pane = State(initialValue: initialPane)
    }
    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Link(repository.fullName, destination: repository.url).font(.subheadline)
                    HStack {
                        Menu {
                            ForEach(workspace.branches) { branch in
                                Button(branch.name, systemImage: workspace.activeBranch == branch.name ? "checkmark" : "arrow.triangle.branch") {
                                    workspace.activeBranch = branch.name; workspace.selectedCommit = nil; workspace.details = nil; workspace.path = ""
                                    run { await workspace.loadTree(api: $0) }
                                }
                            }
                        } label: { Label(workspace.activeBranch.isEmpty ? "无远端分支" : workspace.activeBranch, systemImage: "arrow.triangle.branch") }.buttonStyle(M3ButtonStyle())
                        Spacer()
                        Text("远端只读").font(.caption).foregroundStyle(M3.muted)
                    }
                    Picker("工作台栏目", selection: $pane) {
                        ForEach(["Graph", "更改", "文件", "设备"], id: \.self) { Text($0) }
                    }.pickerStyle(.segmented)
                }.padding(.horizontal, 16)
                if !workspace.error.isEmpty { Notice(text: workspace.error).padding(.horizontal, 16) }
                if workspace.loading && workspace.commits.isEmpty { ProgressView("正在读取远端内容…").padding() }
                if pane == "设备" { DevicesView(repositoryID: repository.presenceID, embedded: true) }
                else if geometry.size.width >= 1000 {
                    HStack(alignment: .top, spacing: 16) {
                        graph.frame(maxWidth: .infinity)
                        changes.frame(maxWidth: .infinity)
                        tree.frame(maxWidth: .infinity)
                    }.padding(.horizontal, 16)
                } else {
                    Group { if pane == "Graph" { graph } else if pane == "更改" { changes } else { tree } }.padding(.horizontal, 16)
                }
            }.padding(.top, 12).background(M3.background)
        }
        .navigationTitle(repository.name).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("刷新", systemImage: "arrow.clockwise") { run { await workspace.refresh(api: $0) } }.disabled(workspace.loading)
            }
        }
        .task { do { await workspace.refresh(api: try app.api(for: repository)) } catch { workspace.error = error.localizedDescription } }
        .sheet(item: $openedFile) { file in
            RemoteFileView(repository: repository, ref: fileRef, file: file)
        }
    }
    private func run(_ action: @escaping @MainActor (GitAPI) async -> Void) {
        Task { do { await action(try app.api(for: repository)) } catch { workspace.error = error.localizedDescription } }
    }
    private var graph: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                HStack {
                    MultiFilter(title: "分支", options: workspace.branches.map { FilterOption(id: $0.name, label: $0.name) }, selection: $workspace.branchFilter)
                    MultiFilter(title: "提交者", options: Set(workspace.commits.values.map(\.author)).sorted().map { FilterOption(id: $0, label: $0) }, selection: $workspace.authorFilter)
                }.padding(.bottom, 12)
                ForEach(workspace.rows) { row in
                    Button {
                        run { await workspace.select(row.commit.id, api: $0) }
                    } label: {
                        HStack(spacing: 10) {
                            GraphDrawing(row: row).frame(width: min(CGFloat(max(row.width, 1)) * 14 + 12, 96), height: 70)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(row.commit.summary).font(.subheadline.weight(.medium)).lineLimit(2)
                                let refs = workspace.branches.filter { $0.head == row.id }.map(\.name)
                                if !refs.isEmpty { Text(refs.joined(separator: " · ")).font(.caption).foregroundStyle(M3.primary).lineLimit(2) }
                                Text("\(row.commit.author) · \(row.id.prefix(8))").font(.caption).foregroundStyle(M3.muted)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.padding(.horizontal, 10).background(workspace.selectedCommit == row.id ? M3.surface : M3.content, in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.plain).accessibilityLabel("\(row.commit.summary)，\(row.commit.author)，\(row.id.prefix(8))")
                }
                if workspace.rows.isEmpty && !workspace.loading { EmptyState(title: "暂无提交", symbol: "point.3.connected.trianglepath.dotted", message: "当前筛选范围内没有已读取的远端提交。") }
                if workspace.hasMore[workspace.activeBranch] == true {
                    Button("加载 \(workspace.activeBranch) 的更多提交") { run { await workspace.loadMore(api: $0) } }
                        .buttonStyle(M3ButtonStyle()).disabled(workspace.loading).padding(.vertical, 16)
                }
            }.padding(.bottom, 32)
        }.refreshable { do { await workspace.refresh(api: try app.api(for: repository)) } catch { workspace.error = error.localizedDescription } }
    }
    private var changes: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let selected = workspace.selectedCommit {
                    if let details = workspace.details, details.commit.id == selected {
                        M3Card {
                            Text(details.commit.message).font(.body).textSelection(.enabled)
                            Text(details.commit.author).font(.subheadline).foregroundStyle(M3.muted)
                            Text(details.commit.id).font(.caption.monospaced()).textSelection(.enabled)
                            Text(details.commit.date).font(.caption).foregroundStyle(M3.muted)
                            Text("更改清单 · \(details.files.count)").font(.headline)
                            ForEach(details.files) { file in
                                Button {
                                    fileRef = selected; openedFile = file
                                } label: {
                                    HStack(alignment: .top) {
                                        Image(systemName: "doc.text")
                                        Text(file.path).frame(maxWidth: .infinity, alignment: .leading)
                                        Text(file.status ?? "修改").foregroundStyle(M3.muted)
                                    }.font(.subheadline).padding(.vertical, 10)
                                }.buttonStyle(.plain)
                                Divider()
                            }
                        }
                    } else { ProgressView("正在读取提交更改…").frame(maxWidth: .infinity).padding() }
                    Button("取消提交选择") {
                        workspace.selectedCommit = nil; workspace.details = nil; workspace.path = ""
                        run { await workspace.loadTree(api: $0) }
                    }.buttonStyle(M3ButtonStyle())
                } else {
                    EmptyState(title: "选择一次远端提交", symbol: "doc.text.magnifyingglass", message: "在 Graph 中选择提交，查看更改清单和提交说明。设备上的未提交更改可在“设备”中查看。")
                }
            }.padding(.bottom, 32)
        }
    }
    private var tree: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                M3Card {
                    Text(workspace.path.isEmpty ? "文件树" : workspace.path).font(.headline).textSelection(.enabled)
                    Text("\(workspace.activeBranch) · \(workspace.ref.prefix(8))").font(.caption.monospaced()).foregroundStyle(M3.muted)
                    if !workspace.path.isEmpty {
                        Button("返回上级目录", systemImage: "arrow.up") {
                            workspace.path = workspace.path.split(separator: "/").dropLast().joined(separator: "/")
                            run { await workspace.loadTree(api: $0) }
                        }.buttonStyle(M3ButtonStyle())
                    }
                    if workspace.treeLoading { ProgressView("正在读取文件树…") }
                    else {
                        ForEach(workspace.files) { file in
                            Button {
                                if file.isDirectory {
                                    workspace.path = file.path
                                    run { await workspace.loadTree(api: $0) }
                                } else { fileRef = workspace.ref; openedFile = file }
                            } label: {
                                Label(file.name, systemImage: file.isDirectory ? "folder" : "doc").frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                            }.buttonStyle(.plain)
                        }
                        if workspace.files.isEmpty { Text("这个目录没有文件。").foregroundStyle(M3.muted) }
                    }
                }
            }.padding(.bottom, 32)
        }
    }
}

private struct GraphDrawing: View {
    let row: GraphRow
    private let colors: [Color] = [.indigo, .teal, .orange, .purple, .pink, .blue]
    var body: some View {
        Canvas { context, size in
            func x(_ lane: Int) -> CGFloat { CGFloat(lane) * min(14, (size.width - 16) / CGFloat(max(row.width, 1))) + 8 }
            for edge in row.edges {
                var path = Path()
                path.move(to: CGPoint(x: x(edge.from), y: edge.joinsCommit ? size.height / 2 : 0))
                path.addCurve(to: CGPoint(x: x(edge.to), y: size.height), control1: CGPoint(x: x(edge.from), y: size.height * 0.7), control2: CGPoint(x: x(edge.to), y: size.height * 0.7))
                context.stroke(path, with: .color(colors[edge.from % colors.count]), lineWidth: 2)
            }
            var top = Path(); top.move(to: CGPoint(x: x(row.lane), y: 0)); top.addLine(to: CGPoint(x: x(row.lane), y: size.height / 2))
            context.stroke(top, with: .color(colors[row.lane % colors.count]), lineWidth: 2)
            context.fill(Path(ellipseIn: CGRect(x: x(row.lane) - 4, y: size.height / 2 - 4, width: 8, height: 8)), with: .color(colors[row.lane % colors.count]))
        }.accessibilityHidden(true)
    }
}

private struct RemoteFileView: View {
    let repository: GitRepository
    let ref: String
    let file: GitFile
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var text: String?
    @State private var error = ""
    var body: some View {
        NavigationStack {
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: 16) {
                    Text(file.path).font(.headline).textSelection(.enabled)
                    if let previous = file.previousPath, previous != file.path { Text("\(previous) → \(file.path)").font(.caption) }
                    if let patch = file.patch { Text(patch).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
                    else if let text { Text(text).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
                    else if error.isEmpty { ProgressView("正在读取远端文件…") }
                    if !error.isEmpty { Notice(text: error) }
                    Link("在平台打开仓库", destination: repository.url).buttonStyle(M3ButtonStyle())
                }.padding(16)
            }.background(M3.background).navigationTitle(file.name).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
                .task {
                    if file.patch != nil { return }
                    do { text = try await app.api(for: repository).file(repository, ref: ref, path: file.path) }
                    catch is CancellationError { return }
                    catch { self.error = error.localizedDescription }
                }
        }
    }
}
