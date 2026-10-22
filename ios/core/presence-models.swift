import Foundation

struct PresenceCredentials: Codable, Identifiable, Sendable {
    let id: UUID
    let url: URL
    let accountID: String
    let identityID: String
    let displayName: String
    let issuer: String
    let sessionToken: String
    let expiresAt: Double
    let deviceID: String
    let deviceToken: String
    let deviceName: String
    var enabled: Bool
}

struct PresenceFile: Codable, Identifiable, Sendable {
    var id: String { path }
    let path: String
    let git: String
    let editor: String
    let pending: Bool
    let activity: String
    let sources: [JSONValue]
}
struct PresenceProject: Codable, Sendable {
    let repositoryId: String
    let worktreeId: String
    let branch: String?
    let head: String?
    let gitReady: Bool
    let unpublishedCommits: Int?
    let organizationId: String?
    let files: [PresenceFile]
}
struct PresenceSession: Codable, Sendable {
    let sessionId: String
    let userId: String
    let identityId: String?
    let displayName: String
    let deviceId: String
    let deviceName: String?
    let alive: Bool
    let lastSeen: Double
    let projects: [PresenceProject]
}
struct PresenceOrganization: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let role: String
    let projects: [String]
    let revision: Int
}
struct PresenceWorld: Decodable, Sendable {
    let version: Int
    let revision: Int
    let sessions: [PresenceSession]
    let organizations: [PresenceOrganization]
}
enum RemoteAction: String, Codable, CaseIterable, Identifiable, Sendable {
    case commit, submit, abort, discard
    var id: String { rawValue }
    var label: String {
        switch self { case .commit: "Commit"; case .submit: "Submit"; case .abort: "中止操作"; case .discard: "丢弃更改" }
    }
    var symbol: String {
        switch self { case .commit: "record.circle"; case .submit: "arrow.up"; case .abort: "xmark"; case .discard: "eraser" }
    }
}
struct ControlWorkspace: Codable, Identifiable, Sendable {
    let id: String
    let repositoryId: String
    let worktreeId: String?
    let branch: String
    let head: String
    let teamId: String?
    let scopeVersion: Int?
    let actions: [RemoteAction]
}
struct ControlDevice: Codable, Identifiable, Sendable {
    var id: String { deviceId }
    let deviceId: String
    let userId: String
    let identityId: String?
    let name: String
    let online: Bool
    let lastSeen: Double
    let workspaces: [ControlWorkspace]
}
struct ControlTeam: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let role: String?
    let projects: [String]
}
struct ControlState: Codable, Sendable {
    let deviceId: String
    let userId: String
    let identityId: String?
    let repositories: [String]
    let devices: [ControlDevice]
    let teams: [ControlTeam]
    let jobs: [ControlJob]
}
struct RemoteFile: Codable, Identifiable, Sendable {
    var id: String { path }
    let path: String
    let fromPath: String?
    let status: String
    let tracked: Bool
}
struct ControlResult: Codable, Sendable {
    let previewId: String?
    let expiresAt: Double?
    let branch: String?
    let head: String?
    let changeKey: String?
    let files: [RemoteFile]?
    let summary: String?
    let description: String?
    let aiError: String?
    let operation: String?
    let running: Bool?
    let cancelRequested: Bool?
    let phase: String?
    let commitId: String?
    let pushed: Bool?
    let backupId: String?
    let warning: String?
}
struct ControlJob: Codable, Identifiable, Sendable {
    let id: String
    let deviceId: String
    let workspaceId: String
    let repositoryId: String
    let organizationId: String?
    let scopeVersion: Int?
    let action: RemoteAction
    let kind: String
    let status: String
    let expiresAt: Double
    let result: ControlResult?
    let error: String
    let previousId: String?
    var terminal: Bool { ["done", "failed", "expired"].contains(status) }
    var label: String {
        if status == "queued" { return "等待目标设备" }
        if status == "running" { return "目标正在执行…" }
        if status != "done" { return error.isEmpty ? "远端操作未完成" : error }
        switch result?.phase {
        case "prepared": return "预览已准备"
        case "committed": return action == .submit ? "已提交，推送未确认" : "已提交"
        case "pushed": return "已提交并推送"
        case "aborted": return result?.cancelRequested == true ? "已请求中止，等待安全收尾" : "已中止"
        case "discarded": return "已丢弃，备份已保留"
        case "restored": return "已恢复"
        case "interrupted": return "执行被打断，请查看目标状态"
        default: return "操作已结束"
        }
    }
}
struct RemoteTarget: Identifiable, Sendable {
    var id: String { "\(serverID):\(device.deviceId):\(workspace.teamId ?? "personal"):\(workspace.id)" }
    let serverID: UUID
    let device: ControlDevice
    let workspace: ControlWorkspace
}
struct DeviceWorktree: Identifiable, Sendable {
    let id: String
    let serverID: UUID
    let deviceID: String
    let deviceName: String
    let displayName: String
    let repositoryID: String
    let worktreeID: String
    let organizationID: String?
    let branch: String
    let head: String?
    let online: Bool
    let project: PresenceProject?
    let target: RemoteTarget?
    var changedCount: Int? {
        guard online, let project, project.gitReady, !project.files.contains(where: { $0.git == "unknown" || $0.pending }) else { return nil }
        return project.files.filter { $0.git == "dirty" }.count
    }
    var editorLabel: String {
        guard online, let project else { return "编辑器状态未知" }
        if !project.files.contains(where: { !$0.sources.isEmpty }) { return "编辑器未接入" }
        if project.files.contains(where: { $0.editor == "unknown" }) { return "编辑器状态未知" }
        return "编辑器未保存 \(project.files.filter { $0.editor == "dirty" }.count)"
    }
}

enum WorktreeRoster {
    static func rows(server: PresenceCredentials, state: ControlState?, world: PresenceWorld?, controlConnected: Bool, worldConnected: Bool, repositoryID: String? = nil) -> [DeviceWorktree] {
        var rows: [DeviceWorktree] = []
        var matched = Set<String>()
        let sessions = (world?.sessions ?? []).sorted { $0.alive == $1.alive ? $0.lastSeen > $1.lastSeen : $0.alive }
        for session in sessions where session.deviceId != server.deviceID {
            for project in session.projects where repositoryID == nil || project.repositoryId == repositoryID {
                let device = state?.devices.first { $0.deviceId == session.deviceId && $0.userId == session.userId && ($0.identityId == nil || session.identityId == nil || $0.identityId == session.identityId) }
                let candidates = device?.workspaces.filter { $0.repositoryId == project.repositoryId && $0.branch == (project.branch ?? "Detached HEAD") && $0.teamId == project.organizationId } ?? []
                let workspace = candidates.first { $0.worktreeId == project.worktreeId }
                    ?? (candidates.count == 1 && candidates[0].worktreeId == nil ? candidates[0] : nil)
                let target = device.flatMap { device in workspace.map { RemoteTarget(serverID: server.id, device: device, workspace: $0) } }
                if let target { matched.insert(target.id) }
                let key = "\(server.id):\(session.deviceId):\(project.repositoryId):\(project.organizationId ?? "personal"):\(project.worktreeId)"
                if rows.contains(where: { $0.id == key }) { continue }
                rows.append(DeviceWorktree(id: key, serverID: server.id, deviceID: session.deviceId,
                    deviceName: session.deviceName ?? device?.name ?? "设备未知", displayName: session.displayName,
                    repositoryID: project.repositoryId, worktreeID: project.worktreeId, organizationID: project.organizationId,
                    branch: project.branch ?? "分离 HEAD", head: project.head,
                    online: server.enabled && worldConnected && session.alive,
                    project: project, target: controlConnected && device?.online == true ? target : nil))
            }
        }
        for device in state?.devices ?? [] where device.deviceId != server.deviceID {
            for workspace in device.workspaces where repositoryID == nil || workspace.repositoryId == repositoryID {
                let target = RemoteTarget(serverID: server.id, device: device, workspace: workspace)
                if matched.contains(target.id) { continue }
                rows.append(DeviceWorktree(id: target.id, serverID: server.id, deviceID: device.deviceId,
                    deviceName: device.name, displayName: device.userId, repositoryID: workspace.repositoryId,
                    worktreeID: workspace.worktreeId ?? workspace.id, organizationID: workspace.teamId,
                    branch: workspace.branch, head: workspace.head, online: false, project: nil,
                    target: server.enabled && controlConnected && device.online ? target : nil))
            }
        }
        return rows.sorted { ($0.deviceName, $0.branch, $0.id) < ($1.deviceName, $1.branch, $1.id) }
    }
    static func previewIsValid(_ result: ControlResult, for target: RemoteTarget, state: ControlState, now: Double) -> Bool {
        guard let expires = result.expiresAt, expires > now, result.previewId != nil,
              let device = state.devices.first(where: { $0.deviceId == target.device.deviceId && $0.online }),
              let workspace = device.workspaces.first(where: { $0.id == target.workspace.id }) else { return false }
        return workspace.repositoryId == target.workspace.repositoryId && workspace.branch == target.workspace.branch && workspace.teamId == target.workspace.teamId
            && workspace.scopeVersion == target.workspace.scopeVersion && workspace.head == target.workspace.head
    }
}
