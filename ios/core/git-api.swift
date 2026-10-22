import Foundation

struct GitAPI: Sendable {
    let account: GitAccount
    let token: String
    let http: HTTPClient

    var base: URL {
        switch account.provider {
        case .github: URL(string: "https://api.github.com")!
        case .githubEnterprise: Endpoint.url(account.host, ["api", "v3"])
        case .gitlab: Endpoint.url(account.host, ["api", "v4"])
        case .gitee: Endpoint.url(account.host, ["api", "v5"])
        case .gitea: Endpoint.url(account.host, ["api", "v1"])
        }
    }
    var headers: [String: String] {
        account.provider == .gitlab ? ["PRIVATE-TOKEN": token] : ["Authorization": "Bearer \(token)"]
    }
    func get(_ path: [String], query: [URLQueryItem] = []) async throws -> JSONValue {
        try await http.json(Endpoint.url(base, path, query: query), headers: headers)
    }
    func repoPath(_ repo: GitRepository) -> [String] {
        account.provider == .gitlab ? ["projects", repo.remoteID] : ["repos"] + repo.fullName.split(separator: "/").map(String.init)
    }
    func all(_ path: [String], query: [URLQueryItem] = [], key: String? = nil) async throws -> [JSONValue] {
        var output: [JSONValue] = []
        var page = 1
        while true {
            try Task.checkCancellation()
            let url = Endpoint.url(base, path, query: query + [URLQueryItem(name: "per_page", value: "100"), URLQueryItem(name: "limit", value: "100"), URLQueryItem(name: "page", value: String(page))])
            let (data, response) = try await http.request(url, headers: headers)
            let raw = try JSONDecoder().decode(JSONValue.self, from: data)
            guard let values = (key.map { raw[$0] } ?? raw).array else { throw AppFailure.message("列表接口返回了无效数据。") }
            output += values
            let next = response.value(forHTTPHeaderField: "Link")?.contains("rel=\"next\"") == true
                || !(response.value(forHTTPHeaderField: "X-Next-Page") ?? "").isEmpty
            if !next && values.count < 100 { return output }
            guard !values.isEmpty else { throw AppFailure.message("分页接口仍声明有下一页，却返回了空页，已保留上次结果。") }
            // Only advance a local page counter; never send credentials to a provider's Link URL.
            page += 1
        }
    }
    func identity() async throws -> (login: String, name: String) {
        let value = try await get(["user"])
        let login = try value.string(account.provider == .gitlab ? "username" : "login")
        return (login, value["name"].text.flatMap { $0.isEmpty ? nil : $0 } ?? login)
    }
    func repositories() async throws -> [GitRepository] {
        let rows = try await all(account.provider == .gitlab ? ["projects"] : ["user", "repos"],
                                 query: account.provider == .gitlab ? [URLQueryItem(name: "membership", value: "true")] : [])
        var seen = Set<String>()
        return try rows.map(decodeRepository).filter { seen.insert($0.id).inserted }
    }
    func decodeRepository(_ value: JSONValue) throws -> GitRepository {
        let gitlab = account.provider == .gitlab
        let remoteID = try value.identifier("id")
        let fullName = try value.string(gitlab ? "path_with_namespace" : "full_name")
        let address = try Endpoint.base(value.string(gitlab ? "web_url" : "html_url"))
        return GitRepository(id: "\(account.id.uuidString):\(remoteID)", accountID: account.id, remoteID: remoteID,
            name: try value.string("name"), fullName: fullName, description: value["description"].text ?? "",
            defaultBranch: value["default_branch"].text ?? "", url: address,
            isPrivate: gitlab ? value["visibility"].text != "public" : value["private"].bool == true,
            isFork: gitlab ? value["forked_from_project"] != .null : value["fork"].bool == true,
            owner: fullName.components(separatedBy: "/").dropLast().joined(separator: "/"),
            ownerIsOrganization: gitlab ? value["namespace"]["kind"].text.map { $0 == "group" } : value["owner"]["type"].text.map { $0.lowercased() == "organization" },
            updatedAt: value["updated_at"].text ?? value["last_activity_at"].text)
    }
    func branches(_ repo: GitRepository) async throws -> [GitBranch] {
        let values = try await all(repoPath(repo) + (account.provider == .gitlab ? ["repository", "branches"] : ["branches"]))
        return try values.map { value in
            GitBranch(name: try value.string("name"), head: try value["commit"].string(account.provider == .gitlab ? "id" : "sha"), protected: value["protected"].bool == true)
        }
    }
    func decodeCommit(_ value: JSONValue) throws -> GitCommit {
        if account.provider == .gitlab {
            return GitCommit(id: try value.string("id"), message: try value.string("message"), author: try value.string("author_name"),
                             date: try value.string("committed_date"), parents: value["parent_ids"].array?.compactMap(\.text) ?? [])
        }
        return GitCommit(id: try value.string("sha"), message: try value["commit"].string("message"),
            author: value["commit"]["author"]["name"].text ?? value["author"]["login"].text ?? "未知作者",
            date: value["commit"]["committer"]["date"].text ?? value["commit"]["author"]["date"].text ?? "",
            parents: try (value["parents"].array ?? []).map { try $0.string("sha") })
    }
    func history(_ repo: GitRepository, ref: String, page: Int) async throws -> HistoryPage {
        let gitlab = account.provider == .gitlab
        let query = [URLQueryItem(name: gitlab ? "ref_name" : "sha", value: ref), URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "per_page", value: "50"), URLQueryItem(name: "limit", value: "50")]
        let values = try await get(repoPath(repo) + (gitlab ? ["repository", "commits"] : ["commits"]), query: query)
        guard let rows = values.array else { throw AppFailure.message("提交列表无效。") }
        return HistoryPage(commits: try rows.map(decodeCommit), hasMore: rows.count == 50)
    }
    func details(_ repo: GitRepository, sha: String) async throws -> CommitDetails {
        let gitlab = account.provider == .gitlab
        let path = repoPath(repo) + (gitlab ? ["repository", "commits", sha] : ["commits", sha])
        let raw = try await get(path)
        let files = try await all(gitlab ? path + ["diff"] : path, key: gitlab ? nil : "files")
        return CommitDetails(commit: try decodeCommit(raw), files: try files.map { value in
            let name = try value.string(gitlab ? "new_path" : "filename")
            let status = gitlab ? (value["new_file"].bool == true ? "新增" : value["deleted_file"].bool == true ? "删除" : value["renamed_file"].bool == true ? "重命名" : "修改") : value["status"].text ?? "修改"
            return GitFile(path: name, name: name.components(separatedBy: "/").last!, isDirectory: false,
                           status: status, previousPath: value[gitlab ? "old_path" : "previous_filename"].text,
                           patch: value[gitlab ? "diff" : "patch"].text)
        })
    }
    func tree(_ repo: GitRepository, ref: String, path: String) async throws -> [GitFile] {
        let gitlab = account.provider == .gitlab
        let rows: [JSONValue]
        if gitlab {
            rows = try await all(repoPath(repo) + ["repository", "tree"], query: [URLQueryItem(name: "ref", value: ref), URLQueryItem(name: "path", value: path)])
        } else {
            let value = try await get(repoPath(repo) + ["contents"] + path.split(separator: "/").map(String.init), query: [URLQueryItem(name: "ref", value: ref)])
            guard let array = value.array else { throw AppFailure.message("文件树响应无效。") }
            rows = array
        }
        return try rows.map { value in
            GitFile(path: try value.string("path"), name: try value.string("name"), isDirectory: ["dir", "tree"].contains(value["type"].text ?? ""), status: nil, previousPath: nil, patch: nil)
        }.sorted { $0.isDirectory == $1.isDirectory ? $0.name.localizedStandardCompare($1.name) == .orderedAscending : $0.isDirectory }
    }
    func file(_ repo: GitRepository, ref: String, path: String) async throws -> String {
        let data: Data
        if account.provider == .gitlab {
            (data, _) = try await http.request(Endpoint.url(base, repoPath(repo) + ["repository", "files", path, "raw"], query: [URLQueryItem(name: "ref", value: ref)]), headers: headers)
        } else {
            let value = try await get(repoPath(repo) + ["contents"] + path.split(separator: "/").map(String.init), query: [URLQueryItem(name: "ref", value: ref)])
            guard value["encoding"].text == "base64", let content = value["content"].text,
                  let decoded = Data(base64Encoded: content, options: .ignoreUnknownCharacters)
            else { throw AppFailure.message("平台未提供文件正文，请在仓库网页查看。") }
            data = decoded
        }
        guard !data.contains(0), let text = String(data: data, encoding: .utf8) else { throw AppFailure.message("这是二进制或非 UTF-8 文件，请在仓库网页查看。") }
        return text
    }
}
