import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

enum Endpoint {
    static func base(_ input: String) throws -> URL {
        guard let url = URL(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil,
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host))
        else { throw AppFailure.message("请输入完整 HTTPS 服务地址，不能包含账号、查询参数或片段。") }
        return url
    }
    static func url(_ base: URL, _ segments: [String], query: [URLQueryItem] = []) -> URL {
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/%?#"))
        let suffix = segments.map { $0.addingPercentEncoding(withAllowedCharacters: allowed)! }.joined(separator: "/")
        components.percentEncodedPath = components.percentEncodedPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.percentEncodedPath = "/" + [components.percentEncodedPath, suffix].filter { !$0.isEmpty }.joined(separator: "/")
        components.queryItems = query.isEmpty ? nil : query
        return components.url!
    }
}

private final class RefuseRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

struct HTTPClient: Sendable {
    let session: URLSession
    init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCredentialStorage = nil
        config.timeoutIntervalForRequest = 30
        session = URLSession(configuration: config, delegate: RefuseRedirects(), delegateQueue: nil)
    }
    init(session: URLSession) { self.session = session }

    func request(_ url: URL, method: String = "GET", headers: [String: String] = [:], body: JSONValue? = nil) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("GitTogether-iOS", forHTTPHeaderField: "User-Agent")
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, raw) = try await session.data(for: request)
        guard let response = raw as? HTTPURLResponse else { throw AppFailure.message("服务未返回 HTTP 响应。") }
        guard (200..<300).contains(response.statusCode) else {
            let explanation: String
            switch response.statusCode {
            case 301..<400: explanation = "服务地址发生重定向，请使用最终 HTTPS 地址。"
            case 401: explanation = "登录凭证已失效，请重新连接账号。"
            case 403: explanation = "服务器拒绝访问，请检查账号、仓库授权或平台限流。"
            case 404: explanation = "仓库、接口或目标已不存在，或当前账号无权访问。"
            case 409: explanation = "目标或预览已变化，请刷新状态并重新预览。"
            case 429: explanation = "请求受到限流，请稍后手动重试。"
            default: explanation = "服务器请求未完成。"
            }
            throw AppFailure.message("\(explanation)（HTTP \(response.statusCode)）")
        }
        guard data.count <= 16 * 1024 * 1024 else { throw AppFailure.message("接口响应超过 16 MiB，请在平台网页查看。") }
        return (data, response)
    }
    func json(_ url: URL, method: String = "GET", headers: [String: String] = [:], body: JSONValue? = nil) async throws -> JSONValue {
        let (data, _) = try await request(url, method: method, headers: headers, body: body)
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }
}
