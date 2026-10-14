import Foundation
import Security

// Inspect a configured file-based keychain without requesting an unlock or
// reading credentials. notarytool otherwise opens a system unlock prompt.
guard CommandLine.arguments.count == 2 else { exit(64) }
var keychain: SecKeychain?
let opened = SecKeychainOpen(CommandLine.arguments[1], &keychain)
guard opened == errSecSuccess, let keychain else {
    FileHandle.standardError.write(Data("Keychain metadata unavailable (\(opened)).\n".utf8))
    exit(1)
}
var status: SecKeychainStatus = 0
let inspected = SecKeychainGetStatus(keychain, &status)
guard inspected == errSecSuccess else {
    FileHandle.standardError.write(Data("Keychain metadata unavailable (\(inspected)).\n".utf8))
    exit(1)
}
print("{\"unlocked\":\(status & kSecUnlockStateStatus != 0)}")
