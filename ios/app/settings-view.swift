import SwiftUI

private struct AccountSheet: Identifiable {
    let account: GitAccount?
    var id: String { account?.id.uuidString ?? "new" }
}

struct SettingsView: View {
    @EnvironmentObject private var app: AppModel
    @State private var accountSheet: AccountSheet?
    @State private var removingAccount: GitAccount?
    @State private var presenceForm = false
    @State private var removingServer: PresenceCredentials?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                M3Card {
                    Text("外观").font(.headline)
                    Picker("外观", selection: $app.theme) {
                        Text("系统").tag("system"); Text("浅色").tag("light"); Text("深色").tag("dark")
                    }.pickerStyle(.segmented)
                }
                M3Card {
                    Text("账号").font(.headline)
                    ForEach(app.accounts) { account in
                        HStack {
                            Button { accountSheet = AccountSheet(account: account) } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(account.name).font(.subheadline.weight(.medium))
                                    Text("\(account.provider.label) · \(account.login)@\(account.host.host ?? "")").font(.caption).foregroundStyle(M3.muted)
                                }.frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                            }.buttonStyle(.plain)
                            Button("移除账号", systemImage: "minus.circle", role: .destructive) { removingAccount = account }.labelStyle(.iconOnly).frame(width: 44, height: 44)
                        }
                        if let error = app.accountErrors[account.id] { Notice(text: error) }
                        Divider()
                    }
                    Button("添加账号", systemImage: "plus") { accountSheet = AccountSheet(account: nil) }.buttonStyle(M3ButtonStyle())
                }
                M3Card {
                    Text("插件 → Presence").font(.headline)
                    if app.servers.isEmpty {
                        Text("登录独立 Presence 账号，查看设备上的 worktree 并发起远程操作。").font(.subheadline).foregroundStyle(M3.muted)
                    }
                    ForEach(app.servers) { server in
                        VStack(alignment: .leading, spacing: 10) {
                            Toggle(isOn: Binding(get: { app.servers.first { $0.id == server.id }?.enabled ?? false }, set: { enabled in
                                do { try app.setServerEnabled(server.id, enabled: enabled) } catch { app.error = error.localizedDescription }
                            })) { Text(server.url.absoluteString).font(.subheadline) }
                            Text("\(server.displayName) · \(server.deviceName)").font(.caption).foregroundStyle(M3.muted)
                            Text(connectionLabel(server)).font(.caption).foregroundStyle(M3.muted)
                            if let error = app.presence[server.id]?.error, !error.isEmpty { Notice(text: error) }
                            HStack {
                                Button("重新连接") { app.reconnect(server) }.buttonStyle(M3ButtonStyle()).disabled(!server.enabled)
                                Button(app.servers.first?.id == server.id ? "退出账号" : "移除服务器", role: .destructive) { removingServer = server }.buttonStyle(M3ButtonStyle(destructive: true))
                            }
                            Link("账号与组织管理", destination: Endpoint.url(server.url, ["account"]))
                            Divider()
                        }
                    }
                    Button(app.servers.isEmpty ? "登录 Presence" : "添加服务器", systemImage: "plus") { presenceForm = true }.buttonStyle(M3ButtonStyle(filled: true))
                }
                M3Card {
                    Text("GitTogether").font(.headline)
                    Text("把仓库当作项目，把分支当作任务。").font(.subheadline)
                    Text("iOS \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))").font(.caption).foregroundStyle(M3.muted)
                    Text("手机仅浏览远端。Git 凭证和文件正文留在执行设备；Presence 只传递有限操作与状态。").font(.caption).foregroundStyle(M3.muted)
                    Link("GitHub", destination: URL(string: "https://github.com/DDonlien/git-together")!)
                }
            }.padding(16).padding(.bottom, 16)
        }.background(M3.background).navigationTitle("设置").navigationBarTitleDisplayMode(.inline)
            .sheet(item: $accountSheet) { AccountEditor(account: $0.account) }
            .sheet(isPresented: $presenceForm) { PresenceConnectionForm() }
            .confirmationDialog("移除账号及其手机缓存？", isPresented: Binding(get: { removingAccount != nil }, set: { if !$0 { removingAccount = nil } })) {
                if let account = removingAccount {
                    Button("移除账号", role: .destructive) {
                        do { try app.removeAccount(account) } catch { app.error = error.localizedDescription }
                        removingAccount = nil
                    }
                }
            } message: { Text("桌面设备和远端仓库不受影响。") }
            .confirmationDialog("撤销这台手机在此服务器的设备授权并退出？", isPresented: Binding(get: { removingServer != nil }, set: { if !$0 { removingServer = nil } })) {
                if let server = removingServer {
                    Button("撤销并退出", role: .destructive) { Task {
                        do { try await app.removeServer(server) } catch { app.error = error.localizedDescription }
                        removingServer = nil
                    } }
                }
            }
    }
    private func connectionLabel(_ server: PresenceCredentials) -> String {
        if !server.enabled { return "已停用" }
        guard let runtime = app.presence[server.id] else { return "正在连接…" }
        if runtime.controlConnected && runtime.worldConnected { return "已连接" }
        if runtime.controlConnected { return "控制已连接，协作状态未知" }
        return runtime.error.isEmpty ? "正在连接…" : "离线，状态未知"
    }
}

struct AccountEditor: View {
    let account: GitAccount?
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var provider: GitProvider
    @State private var host: String
    @State private var name: String
    @State private var token = ""
    @State private var busy = false
    @State private var error = ""
    init(account: GitAccount?) {
        self.account = account
        _provider = State(initialValue: account?.provider ?? .github)
        _host = State(initialValue: account?.host.absoluteString ?? GitProvider.github.defaultHost)
        _name = State(initialValue: account?.name ?? "")
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    M3Card {
                        Picker("平台", selection: $provider) { ForEach(GitProvider.allCases) { Text($0.label).tag($0) } }.disabled(account != nil)
                        if provider != .github { M3Field(title: "HTTPS 服务地址", text: $host).keyboardType(.URL).disabled(account != nil) }
                        M3Field(title: "账号名称", text: $name)
                        M3Field(title: account == nil ? "访问令牌" : "新访问令牌（留空保留）", text: $token, secure: true)
                        Text("令牌保存在这台设备的系统 Keychain；仓库、分支和文件通过平台 API 读取。").font(.caption).foregroundStyle(M3.muted)
                        if let account { Text("已连接身份：\(account.login)").font(.caption) }
                        if !error.isEmpty { Notice(text: error) }
                        Button {
                            busy = true; error = ""
                            Task {
                                defer { busy = false }
                                do {
                                    if let account { try await app.updateAccount(account, name: name, token: token) }
                                    else { try await app.connect(provider: provider, host: host, name: name, token: token) }
                                    token = ""; dismiss()
                                } catch { self.error = error.localizedDescription }
                            }
                        } label: {
                            if busy { ProgressView("正在连接…") } else { Text(account == nil ? "连接账号" : "保存") }
                        }.buttonStyle(M3ButtonStyle(filled: true)).disabled(busy || (account == nil && token.isEmpty))
                    }
                }.padding(16)
            }.background(M3.background).navigationTitle(account == nil ? "添加账号" : "编辑账号").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { token = ""; dismiss() }.disabled(busy) } }
                .onChange(of: provider) { _, next in if account == nil { host = next.defaultHost } }
                .interactiveDismissDisabled(busy)
        }
    }
}

private struct PresenceConnectionForm: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var email = ""
    @State private var password = ""
    @State private var name = "GitTogether · iPhone"
    @State private var busy = false
    @State private var error = ""
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    M3Card {
                        M3Field(title: "Presence HTTPS 服务地址", text: $address).keyboardType(.URL)
                        M3Field(title: "这台设备的名称", text: $name)
                        if app.servers.isEmpty {
                            M3Field(title: "邮箱", text: $email).keyboardType(.emailAddress)
                            M3Field(title: "密码", text: $password, secure: true)
                        } else {
                            Text("使用当前 Presence 身份连接受信任服务器。归属服务的密码和会话不会发给目标服务器。").font(.caption).foregroundStyle(M3.muted)
                        }
                        if !error.isEmpty { Notice(text: error) }
                        Button {
                            busy = true; error = ""
                            Task {
                                defer { busy = false; password = "" }
                                do {
                                    if app.servers.isEmpty { try await app.loginPresence(url: address, email: email, password: password, name: name) }
                                    else { try await app.addPresenceServer(url: address, name: name) }
                                    dismiss()
                                } catch { self.error = error.localizedDescription }
                            }
                        } label: { if busy { ProgressView("正在连接…") } else { Text(app.servers.isEmpty ? "登录" : "添加服务器") } }
                            .buttonStyle(M3ButtonStyle(filled: true)).disabled(busy || address.isEmpty || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 120 || (app.servers.isEmpty && (email.isEmpty || password.isEmpty || password.count > 128)))
                        if let url = try? Endpoint.base(address) {
                            Link("注册、密码与账号管理", destination: Endpoint.url(url, ["account"]))
                        }
                    }
                }.padding(16)
            }.background(M3.background).navigationTitle(app.servers.isEmpty ? "登录 Presence" : "添加服务器").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { password = ""; dismiss() }.disabled(busy) } }
                .interactiveDismissDisabled(busy)
        }
    }
}
