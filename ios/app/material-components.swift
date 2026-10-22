import SwiftUI

enum M3 {
    static let background = adaptive(0xf6f5fa, 0x131318)
    static let content = adaptive(0xfffbff, 0x211f26)
    static let surface = adaptive(0xeeedf4, 0x2b2930)
    static let primary = adaptive(0x4559a8, 0xb8c4ff)
    static let onPrimary = adaptive(0xffffff, 0x132978)
    static let text = adaptive(0x1b1b20, 0xe5e1e9)
    static let muted = adaptive(0x5e5d66, 0xc7c5d0)
    static let outline = adaptive(0xe1dfe7, 0x46464f)
    static let danger = adaptive(0xb3261e, 0xffb4ab)
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255, alpha: 1)
        })
    }
}

struct M3Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16).background(M3.content, in: RoundedRectangle(cornerRadius: 20))
    }
}
struct M3ButtonStyle: ButtonStyle {
    var filled = false
    var destructive = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.medium)).padding(.horizontal, 14).frame(minHeight: 44)
            .foregroundStyle(filled ? M3.onPrimary : destructive ? M3.danger : M3.primary)
            .background(filled ? M3.primary : M3.surface, in: RoundedRectangle(cornerRadius: 12))
            .opacity(enabled ? configuration.isPressed ? 0.7 : 1 : 0.4)
    }
}
struct M3Field: View {
    let title: String
    @Binding var text: String
    var secure = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption).foregroundStyle(M3.muted)
            Group {
                if secure { SecureField(title, text: $text) }
                else { TextField(title, text: $text) }
            }.textInputAutocapitalization(.never).autocorrectionDisabled().frame(minHeight: 32)
        }.padding(12).background(M3.content, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(M3.outline))
    }
}
struct Notice: View {
    let text: String
    var body: some View {
        Label(text, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(M3.danger)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            .padding(12).background(M3.surface, in: RoundedRectangle(cornerRadius: 12)).accessibilityAddTraits(.isStaticText)
    }
}
struct EmptyState: View {
    let title: String
    let symbol: String
    let message: String
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: symbol).font(.largeTitle).foregroundStyle(M3.primary)
            Text(title).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(M3.muted).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(32)
    }
}
struct Chip: View {
    let text: String
    var body: some View { Text(text).font(.caption).padding(.horizontal, 9).padding(.vertical, 5).background(M3.surface, in: Capsule()) }
}
