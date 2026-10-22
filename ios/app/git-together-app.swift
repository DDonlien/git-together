import SwiftUI

@main
struct GitTogetherApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            MainTabs().environmentObject(model).preferredColorScheme(model.colorScheme)
                .tint(M3.primary)
                .task { model.setActive(true); await model.refresh() }
                .onChange(of: scenePhase) { _, phase in model.setActive(phase == .active) }
        }
    }
}

private enum MainTab: Hashable { case dashboard, devices, settings, search }
private struct MainTabs: View {
    @EnvironmentObject private var model: AppModel
    @State private var selected = MainTab.dashboard
    @State private var search = ""
    var body: some View {
        TabView(selection: $selected) {
            Tab("仓库", systemImage: "square.grid.2x2", value: .dashboard) {
                NavigationStack { DashboardView(search: "") }
            }
            Tab("设备", systemImage: "desktopcomputer", value: .devices) {
                NavigationStack { DevicesView(repositoryID: nil) }
            }
            Tab("设置", systemImage: "gearshape", value: .settings) {
                NavigationStack { SettingsView() }
            }
            Tab(value: .search, role: .search) {
                NavigationStack { DashboardView(search: search).navigationTitle("搜索") }
                    .searchable(text: $search, placement: .toolbar, prompt: "搜索仓库、账号或组织")
            }
        }
        .tabBarMinimizeBehavior(.never)
        .foregroundStyle(M3.text)
        .alert("GitTogether", isPresented: Binding(get: { !model.error.isEmpty }, set: { if !$0 { model.error = "" } })) {
            Button("确定") { model.error = "" }
        } message: { Text(model.error) }
    }
}
