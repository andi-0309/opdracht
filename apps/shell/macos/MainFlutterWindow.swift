import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var windowChannel: FlutterMethodChannel?
  private var installerChannel: FlutterMethodChannel?
  private var dragEvent: NSEvent?

  override func sendEvent(_ event: NSEvent) {
    if event.type == .leftMouseDown || event.type == .leftMouseDragged { dragEvent = event }
    super.sendEvent(event)
  }

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = frame
    contentViewController = flutterViewController
    setFrame(windowFrame, display: true)
    title = "Opdracht"
    titleVisibility = .hidden
    titlebarAppearsTransparent = true
    styleMask.insert(.fullSizeContentView)
    minSize = NSSize(width: 480, height: 360)
    hasShadow = true
    isMovableByWindowBackground = false

    windowChannel = FlutterMethodChannel(
      name: "eu.zerver.opdracht/window",
      binaryMessenger: flutterViewController.engine.binaryMessenger)
    windowChannel?.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(nil); return }
      switch call.method {
      case "drag":
        if let event = self.dragEvent { self.performDrag(with: event) }
      case "maximize":
        self.zoom(nil)
      case "theme":
        guard let dark = call.arguments as? Bool else {
          result(FlutterError(code: "invalid_theme", message: "Expected brightness boolean", details: nil))
          return
        }
        self.appearance = nil // Keep following system appearance changes.
        self.backgroundColor = dark
          ? NSColor(srgbRed: 23/255, green: 29/255, blue: 25/255, alpha: 1)
          : NSColor(srgbRed: 247/255, green: 248/255, blue: 242/255, alpha: 1)
      default:
        result(FlutterMethodNotImplemented)
        return
      }
      result(nil)
    }

    installerChannel = FlutterMethodChannel(
      name: "eu.zerver.opdracht/installer",
      binaryMessenger: flutterViewController.engine.binaryMessenger)
    installerChannel?.setMethodCallHandler { call, result in
      guard call.method == "open" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard let path = call.arguments as? String,
            NSWorkspace.shared.open(URL(fileURLWithPath: path)) else {
        result(FlutterError(code: "installer_unavailable", message: nil, details: nil))
        return
      }
      result(true)
    }

    RegisterGeneratedPlugins(registry: flutterViewController)
    super.awakeFromNib()
  }
}
