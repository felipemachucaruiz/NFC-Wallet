// iOS does not support Host Card Emulation for third-party apps.
// This stub keeps the module compilable on iOS but all functions are no-ops.
import ExpoModulesCore

public class NfcHceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NfcHce")

    AsyncFunction("setToken") { (_: String) in }
    AsyncFunction("clearToken") {}
    AsyncFunction("isSupported") { return false }
  }
}
