// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GitTogetherCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "GitTogetherCore", targets: ["GitTogetherCore"])],
    targets: [
        .target(name: "GitTogetherCore", path: "core"),
        .testTarget(name: "GitTogetherCoreTests", dependencies: ["GitTogetherCore"], path: "tests"),
    ]
)
