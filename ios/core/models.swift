import Foundation

enum GitProvider: String, Codable, CaseIterable, Identifiable, Sendable {
    case github, githubEnterprise = "github-enterprise", gitlab, gitee, gitea
    var id: String { rawValue }
    var label: String {
        switch self {
        case .github: "GitHub"
        case .githubEnterprise: "GitHub 企业版"
        case .gitlab: "GitLab"
        case .gitee: "Gitee"
        case .gitea: "Gitea"
        }
    }
    var defaultHost: String {
        switch self {
        case .github: "https://github.com"
        case .gitlab: "https://gitlab.com"
        case .gitee: "https://gitee.com"
        default: ""
        }
    }
}

struct GitAccount: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let provider: GitProvider
    let host: URL
    let login: String
    var name: String
}

struct GitRepository: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let accountID: UUID
    let remoteID: String
    let name: String
    let fullName: String
    let description: String
    let defaultBranch: String
    let url: URL
    let isPrivate: Bool
    let isFork: Bool
    let owner: String
    let ownerIsOrganization: Bool?
    let updatedAt: String?
    var presenceID: String { RepositoryIdentity.canonical(url) }
}

enum RepositoryIdentity {
    static func canonical(_ url: URL) -> String {
        var host = url.host ?? ""
        if let port = url.port, !((url.scheme == "https" && port == 443) || (url.scheme == "http" && port == 80)) {
            host += ":\(port)"
        }
        let path = URLComponents(url: url, resolvingAgainstBaseURL: false)!.percentEncodedPath
        return (host + (path.hasSuffix("/") ? String(path.dropLast()) : path)).lowercased()
    }
}

struct GitBranch: Identifiable, Hashable, Sendable {
    var id: String { name }
    let name: String
    let head: String
    let protected: Bool
}

struct GitCommit: Identifiable, Hashable, Sendable {
    let id: String
    let message: String
    let author: String
    let date: String
    let parents: [String]
    var summary: String { message.components(separatedBy: .newlines).first ?? message }
}

struct GitFile: Identifiable, Hashable, Sendable {
    var id: String { path }
    let path: String
    let name: String
    let isDirectory: Bool
    let status: String?
    let previousPath: String?
    let patch: String?
}

struct CommitDetails: Sendable {
    let commit: GitCommit
    let files: [GitFile]
}

struct HistoryPage: Sendable {
    let commits: [GitCommit]
    let hasMore: Bool
}

enum AppFailure: LocalizedError, Sendable {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let text): text }
    }
}

// Preserve provider JSON types without forwarding untyped dictionaries across actors.
enum JSONValue: Codable, Equatable, Sendable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let object = try? value.decode([String: JSONValue].self) { self = .object(object) }
        else if let array = try? value.decode([JSONValue].self) { self = .array(array) }
        else if let string = try? value.decode(String.self) { self = .string(string) }
        else if let bool = try? value.decode(Bool.self) { self = .bool(bool) }
        else { self = .number(try value.decode(Double.self)) }
    }
    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .object(let object): try value.encode(object)
        case .array(let array): try value.encode(array)
        case .string(let string): try value.encode(string)
        case .number(let number): try value.encode(number)
        case .bool(let bool): try value.encode(bool)
        case .null: try value.encodeNil()
        }
    }
    subscript(_ key: String) -> JSONValue {
        if case .object(let values) = self { return values[key] ?? .null }
        return .null
    }
    var text: String? { if case .string(let value) = self { return value }; return nil }
    var bool: Bool? { if case .bool(let value) = self { return value }; return nil }
    var number: Double? { if case .number(let value) = self { return value }; return nil }
    var array: [JSONValue]? { if case .array(let values) = self { return values }; return nil }
    func string(_ key: String) throws -> String {
        guard let value = self[key].text else { throw AppFailure.message("接口响应缺少 \(key)。") }
        return value
    }
    func identifier(_ key: String) throws -> String {
        if let text = self[key].text { return text }
        if let number = self[key].number { return String(format: "%.0f", number) }
        throw AppFailure.message("接口响应缺少 \(key)。")
    }
    static func strings(_ strings: [String]) -> JSONValue { .array(strings.map(JSONValue.string)) }
}
