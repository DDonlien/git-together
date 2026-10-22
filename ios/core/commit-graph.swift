import Foundation

struct GraphEdge: Sendable { let from: Int; let to: Int; let joinsCommit: Bool }
struct GraphRow: Identifiable, Sendable {
    var id: String { commit.id }
    let commit: GitCommit
    let lane: Int
    let width: Int
    let edges: [GraphEdge]
}

enum CommitGraph {
    static func rows(_ input: [GitCommit]) -> [GraphRow] {
        let unique = Dictionary(input.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var childCounts = Dictionary(unique.keys.map { ($0, 0) }, uniquingKeysWith: +)
        for commit in unique.values {
            for parent in commit.parents where unique[parent] != nil { childCounts[parent, default: 0] += 1 }
        }
        var ready = unique.values.filter { childCounts[$0.id] == 0 }
        var ordered: [GitCommit] = []
        while !ready.isEmpty {
            ready.sort { $0.date == $1.date ? $0.id < $1.id : $0.date > $1.date }
            let commit = ready.removeFirst()
            ordered.append(commit)
            for parent in commit.parents where unique[parent] != nil {
                childCounts[parent]! -= 1
                if childCounts[parent] == 0 { ready.append(unique[parent]!) }
            }
        }
        var lanes: [String] = []
        return ordered.map { commit in
            if !lanes.contains(commit.id) { lanes.append(commit.id) }
            let before = lanes
            let lane = lanes.firstIndex(of: commit.id)!
            lanes.remove(at: lane)
            for (index, parent) in commit.parents.enumerated() where !lanes.contains(parent) {
                lanes.insert(parent, at: min(lane + index, lanes.count))
            }
            var edges = before.enumerated().compactMap { index, id -> GraphEdge? in
                guard id != commit.id, let next = lanes.firstIndex(of: id) else { return nil }
                return GraphEdge(from: index, to: next, joinsCommit: false)
            }
            edges += commit.parents.compactMap { parent in lanes.firstIndex(of: parent).map { GraphEdge(from: lane, to: $0, joinsCommit: true) } }
            return GraphRow(commit: commit, lane: lane, width: max(before.count, lanes.count), edges: edges)
        }
    }
}
