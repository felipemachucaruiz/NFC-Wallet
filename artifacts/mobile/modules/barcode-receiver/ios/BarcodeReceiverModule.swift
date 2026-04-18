import ExpoModulesCore

// Android-only — broadcast intents do not exist on iOS. This stub satisfies the build.
public class BarcodeReceiverModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BarcodeReceiver")
  }
}
