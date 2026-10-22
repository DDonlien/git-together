import SwiftUI

struct OperationSelection: Identifiable {
    let target: RemoteTarget
    let action: RemoteAction
    var id: String { target.id + ":" + action.rawValue }
}

struct DevicesView: View {
    let repositoryID: String?
    var embedded = false
    @EnvironmentObject private var app: AppModel
    @State private var selected: OperationSelection?
    var body: some View {
        Group {
            if embedded { content }
            else { content.navigationTitle("设备与 worktree").navigationBarTitleDisplayMode(.inline) }
        }.sheet(item: $selected) { RemoteOperationSheet(target: $0.target, action: $0.action) }
    }
    private var content: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if app.servers.isEmpty {
                    EmptyState(title: "尚未连接 Presence", symbol: "desktopcomputer", message: "连接 Presence 后，可按设备查看每个仓库的 worktree 和工作状态。")
                    NavigationLink("设置 Presence") { SettingsView() }.buttonStyle(M3ButtonStyle())
                }
                ForEach(app.servers) { server in
                    let rows = app.worktrees(repositoryID: repositoryID).filter { $0.serverID == server.id }
                    Text(server.url.absoluteString).font(.caption).foregroundStyle(M3.muted).textSelection(.enabled)
                    if !server.enabled { Text("已停用 · 状态未知").font(.subheadline).foregroundStyle(M3.muted) }
                    if let error = app.presence[server.id]?.error, !error.isEmpty { Notice(text: error) }
                    if rows.isEmpty { M3Card { Text("暂无此范围内可见的设备工作区。").foregroundStyle(M3.muted) } }
                    ForEach(Array(Set(rows.map(\.deviceID))).sorted(), id: \.self) { deviceID in
                        let worktrees = rows.filter { $0.deviceID == deviceID }
                        M3Card {
                            if let first = worktrees.first {
                                Label(first.deviceName, systemImage: "desktopcomputer").font(.headline)
                                Text(first.displayName).font(.caption).foregroundStyle(M3.muted)
                            }
                            ForEach(worktrees) { row in
                                Divider()
                                worktree(row, server: server)
                            }
                        }
                    }
                }
            }.padding(16).padding(.bottom, 16)
        }.background(M3.background)
    }
    @ViewBuilder private func worktree(_ row: DeviceWorktree, server: PresenceCredentials) -> some View {
        let runtime = app.presence[server.id]
        let organization = runtime?.world?.organizations.first { $0.id == row.organizationID }
        VStack(alignment: .leading, spacing: 10) {
            if repositoryID == nil { Text(row.repositoryID).font(.subheadline.weight(.medium)).textSelection(.enabled) }
            Label(row.branch, systemImage: "arrow.triangle.branch").font(.subheadline.weight(.medium))
            Text(organization.map { "\($0.name) · \($0.role)" } ?? (row.organizationID == nil ? "个人" : "托管组织 · \(row.organizationID!)")).font(.caption).foregroundStyle(M3.muted)
            Text("Worktree · \(row.worktreeID)").font(.caption.monospaced()).foregroundStyle(M3.muted).textSelection(.enabled)
            Text("HEAD · \(row.head ?? "未知")").font(.caption.monospaced()).textSelection(.enabled)
            Text(row.online ? "在线" : "离线或快照不可用 · 状态未知").font(.caption).foregroundStyle(M3.muted)
            ViewThatFits(in: .horizontal) {
                HStack { counts(row) }
                VStack(alignment: .leading, spacing: 8) { counts(row) }
            }
            if let project = row.project, !project.files.isEmpty {
                DisclosureGroup("文件状态 · \(project.files.count)") {
                    ForEach(project.files) { file in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(file.path).font(.caption).textSelection(.enabled)
                            Text(row.online ? "Git: \(file.git) · 编辑器: \(file.editor)\(file.activity == "editing" ? " · 正在编辑" : "")\(file.pending ? " · 待确认" : "")" : "上次 Git: \(file.git) · 上次编辑器: \(file.editor) · 当前未知")
                                .font(.caption2).foregroundStyle(M3.muted)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                    }
                }.font(.subheadline)
            }
            if let target = row.target {
                let jobs = runtime?.state?.jobs.filter { $0.deviceId == target.device.deviceId && $0.workspaceId == target.workspace.id && $0.repositoryId == target.workspace.repositoryId && $0.organizationId == target.workspace.teamId && $0.scopeVersion == target.workspace.scopeVersion } ?? []
                let pending = jobs.contains { !$0.terminal }
                HStack(spacing: 12) {
                    ForEach(target.workspace.actions) { action in
                        Button { selected = OperationSelection(target: target, action: action) } label: {
                            Image(systemName: action.symbol).frame(width: 44, height: 44)
                                .foregroundStyle(action == .discard ? M3.danger : M3.primary)
                                .background(M3.surface, in: Circle())
                        }.buttonStyle(.plain).accessibilityLabel("\(action.label) · \(row.deviceName) · \(row.branch) · Worktree \(row.worktreeID.prefix(12))")
                            .disabled(pending && action != .abort)
                    }
                }
                ForEach(jobs.filter { !["preview", "generate"].contains($0.kind) || !$0.terminal }) { job in
                    RemoteJobCard(job: job, target: target)
                }
            } else { Text("此工作目录当前没有可用的远程操作。").font(.caption).foregroundStyle(M3.muted) }
        }
    }
    @ViewBuilder private func counts(_ row: DeviceWorktree) -> some View {
        Chip(text: row.changedCount.map { "Git 修改 \($0)" } ?? "Git 状态未知")
        Chip(text: row.editorLabel)
        Chip(text: row.online ? row.project?.unpublishedCommits.map { "未 Push \($0)" } ?? "未 Push 未知" : "未 Push 未知")
    }
}

private struct RemoteJobCard: View {
    let job: ControlJob
    let target: RemoteTarget
    @EnvironmentObject private var app: AppModel
    @State private var busy = false
    @State private var error = ""
    @State private var followup: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(job.action.label) · \(job.label)").font(.subheadline)
            if let sha = job.result?.commitId { Text(sha).font(.caption.monospaced()).textSelection(.enabled) }
            if let warning = job.result?.warning { Text(warning).font(.caption).foregroundStyle(M3.muted) }
            if job.status == "queued" {
                Button("取消排队") { perform { try await app.cancelJob(job, serverID: target.serverID) } }.buttonStyle(M3ButtonStyle()).disabled(busy)
            }
            if job.action == .submit && job.result?.phase == "committed" {
                Button("重试推送") { followup = "retryPush" }.buttonStyle(M3ButtonStyle()).disabled(busy)
            }
            if job.result?.phase == "discarded" && job.result?.backupId != nil {
                Button("恢复更改") { followup = "restore" }.buttonStyle(M3ButtonStyle()).disabled(busy)
            }
            if !error.isEmpty { Notice(text: error) }
        }.padding(12).background(M3.surface, in: RoundedRectangle(cornerRadius: 12))
            .confirmationDialog(followup == "restore" ? "恢复丢弃前的文件和暂存状态？目标有新变化时会停止。" : "仅重试推送此提交？", isPresented: Binding(get: { followup != nil }, set: { if !$0 { followup = nil } })) {
                if let kind = followup {
                    Button(kind == "restore" ? "恢复更改" : "重试推送") {
                        followup = nil
                        perform { _ = try await app.enqueue(target: target, action: job.action, kind: kind, previousID: job.id) }
                    }
                }
            }
    }
    private func perform(_ operation: @escaping @MainActor () async throws -> Void) {
        busy = true; error = ""
        Task {
            defer { busy = false }
            do { try await operation() } catch { self.error = error.localizedDescription }
        }
    }
}
