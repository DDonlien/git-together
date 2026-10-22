import SwiftUI

@MainActor
private final class RemoteOperationModel: ObservableObject {
    let target: RemoteTarget
    let action: RemoteAction
    @Published var preview: ControlResult?
    @Published var files: [RemoteFile] = []
    @Published var selected = Set<String>()
    @Published var summary = ""
    @Published var description = ""
    @Published var busy = false
    @Published var error = ""
    @Published var result: ControlJob?
    @Published var executionID: UUID?
    private var initialized = false
    private var preparedSelection: Set<String>?
    init(target: RemoteTarget, action: RemoteAction) { self.target = target; self.action = action }
    var committing: Bool { action == .commit || action == .submit }
    var canExecute: Bool {
        !busy && executionID == nil && preview != nil && (action == .abort || (!selected.isEmpty && selected == preparedSelection))
            && (!committing || (!summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && summary.count <= 1024 && description.count <= 16_384))
    }
    func choose(_ path: String) {
        if !selected.insert(path).inserted { selected.remove(path) }
        preview = nil
    }
    func prepare(app: AppModel, generate: Bool = false) async {
        guard !busy, executionID == nil else { return }
        busy = true; error = ""; preview = nil
        defer { busy = false }
        do {
            let selection = initialized ? selected : nil
            let job = try await app.enqueue(target: target, action: action, kind: generate ? "generate" : "preview", paths: action == .abort ? nil : selection.map { $0.sorted() })
            let completed = try await app.wait(job, serverID: target.serverID)
            guard completed.status == "done", let value = completed.result, value.previewId != nil else { throw AppFailure.message(completed.error.isEmpty ? "目标未返回有效预览。" : completed.error) }
            try Task.checkCancellation()
            if !initialized {
                files = value.files ?? []; selected = Set(files.map(\.path)); initialized = true
            }
            if generate || summary.isEmpty {
                summary = value.summary ?? ""; description = value.description ?? ""
            }
            preview = value; preparedSelection = selected
            if let aiError = value.aiError, !aiError.isEmpty { error = aiError + " 可以手动编辑提交说明。" }
        } catch is CancellationError { return }
        catch { self.error = error.localizedDescription }
    }
    func execute(app: AppModel) async {
        guard canExecute else { return }
        busy = true; error = ""
        let id = UUID()
        executionID = id
        defer { busy = false }
        do {
            let accepted = try await app.enqueue(target: target, action: action, kind: "execute", id: id, preview: preview,
                paths: action == .abort ? nil : selected.sorted(), summary: committing ? summary : nil, description: committing ? description : nil)
            result = accepted
            let completed = try await app.wait(accepted, serverID: target.serverID)
            result = completed
            if completed.status != "done" { error = completed.error.isEmpty ? "目标操作未完成，请查看执行记录。" : completed.error }
        } catch is CancellationError { return }
        catch { self.error = "\(error.localizedDescription) 请求编号：\(id.uuidString.lowercased())。请查询执行记录后再操作。" }
    }
    func query(app: AppModel) async {
        guard let executionID else { return }
        busy = true
        defer { busy = false }
        do {
            let server = try app.server(target.serverID)
            let state = try await app.presenceAPI.state(server)
            guard let job = state.jobs.first(where: { $0.id == executionID.uuidString.lowercased() }) else { throw AppFailure.message("当前授权记录中尚未找到此请求，请查看设备状态；未重新发送写请求。") }
            result = try await app.wait(job, serverID: target.serverID)
            error = result?.status == "done" ? "" : result?.error ?? "结果未知。"
        } catch { self.error = error.localizedDescription }
    }
}

struct RemoteOperationSheet: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var operation: RemoteOperationModel
    @State private var confirming = false
    init(target: RemoteTarget, action: RemoteAction) {
        _operation = StateObject(wrappedValue: RemoteOperationModel(target: target, action: action))
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    M3Card {
                        Text(operation.target.device.name).font(.headline)
                        Text(operation.target.workspace.branch).font(.subheadline)
                        Text("Worktree · \(operation.target.workspace.worktreeId ?? operation.target.workspace.id)").font(.caption.monospaced()).textSelection(.enabled)
                        if let server = app.servers.first(where: { $0.id == operation.target.serverID }) { Text(server.url.absoluteString).font(.caption).foregroundStyle(M3.muted) }
                        if operation.busy { ProgressView(operation.executionID == nil ? "正在准备更改清单…" : "正在查询目标执行结果…") }
                        if !operation.error.isEmpty { Notice(text: operation.error) }
                        if let result = operation.result {
                            Text(result.label).font(.headline)
                            if let sha = result.result?.commitId { Text(sha).font(.caption.monospaced()).textSelection(.enabled) }
                            if let warning = result.result?.warning { Notice(text: warning) }
                        }
                        if operation.executionID == nil {
                            if operation.committing {
                                M3Field(title: "Summary", text: $operation.summary).disabled(operation.busy)
                                Text("Description").font(.caption).foregroundStyle(M3.muted)
                                TextEditor(text: $operation.description).frame(minHeight: 120).scrollContentBackground(.hidden)
                                    .padding(8).background(M3.surface, in: RoundedRectangle(cornerRadius: 12)).disabled(operation.busy)
                                Text("\(operation.summary.count)/1024 · \(operation.description.count)/16384").font(.caption).foregroundStyle(M3.muted)
                            }
                            if operation.action == .discard { Text("将选中的文件恢复到目标当前提交，删除选中的新增文件，并保留恢复备份。").font(.subheadline) }
                            if operation.action == .abort { Text("请求目标中止当前操作；已经开始的提交会安全收尾。").font(.subheadline) }
                            Text("仅处理已保存到磁盘的 Git 文件，未保存的编辑器内容仍保留在目标设备。").font(.caption).foregroundStyle(M3.muted)
                            if operation.action != .abort {
                                HStack {
                                    Text("更改清单 · \(operation.selected.count)").font(.headline)
                                    Spacer()
                                    Button(operation.selected.count == operation.files.count ? "取消全选" : "全选") {
                                        operation.selected = operation.selected.count == operation.files.count ? [] : Set(operation.files.map(\.path))
                                        operation.preview = nil
                                    }.disabled(operation.busy)
                                }
                                ForEach(operation.files) { file in
                                    Button { operation.choose(file.path) } label: {
                                        HStack(alignment: .top, spacing: 10) {
                                            Image(systemName: operation.selected.contains(file.path) ? "checkmark.square.fill" : "square")
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(file.fromPath.map { "\($0) → \(file.path)" } ?? file.path)
                                                Text(file.status).foregroundStyle(M3.muted)
                                            }.font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
                                        }.frame(minHeight: 44)
                                    }.buttonStyle(.plain).disabled(operation.busy).accessibilityLabel("\(operation.selected.contains(file.path) ? "已选择" : "未选择") \(file.path)")
                                }
                            }
                            ViewThatFits(in: .horizontal) {
                                HStack { preparationButtons }
                                VStack(alignment: .leading) { preparationButtons }
                            }
                            Button(operation.action.label) { confirming = true }.buttonStyle(M3ButtonStyle(filled: true, destructive: operation.action == .discard)).disabled(!operation.canExecute)
                        } else {
                            Button("查询执行记录") { Task { await operation.query(app: app) } }.buttonStyle(M3ButtonStyle()).disabled(operation.busy)
                        }
                    }
                }.padding(16).padding(.bottom, 16)
            }.background(M3.background).navigationTitle(operation.action.label).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(operation.executionID == nil ? "取消" : "关闭") { dismiss() } } }
                .task { await operation.prepare(app: app) }
                .confirmationDialog("\(operation.action.label) · \(operation.target.device.name) / \(operation.target.workspace.branch)？", isPresented: $confirming) {
                    Button("确认 \(operation.action.label)", role: operation.action == .discard ? .destructive : nil) {
                        Task { await operation.execute(app: app) }
                    }
                } message: { Text("目标固定为上述设备与工作目录。\(operation.action == .submit ? "Submit 将先 Commit 再 Push。" : "")") }
        }
    }
    @ViewBuilder private var preparationButtons: some View {
        Button("更新预览") { Task { await operation.prepare(app: app) } }.buttonStyle(M3ButtonStyle()).disabled(operation.busy || (operation.action != .abort && operation.selected.isEmpty && !operation.files.isEmpty))
        if operation.committing {
            Button("AI 生成说明", systemImage: "sparkles") { Task { await operation.prepare(app: app, generate: true) } }.buttonStyle(M3ButtonStyle()).disabled(operation.busy || operation.selected.isEmpty)
        }
    }
}
