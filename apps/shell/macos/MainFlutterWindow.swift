import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var windowChannel: FlutterMethodChannel?
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
        self.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        self.backgroundColor = dark
          ? NSColor(srgbRed: 23/255, green: 29/255, blue: 25/255, alpha: 1)
          : NSColor(srgbRed: 247/255, green: 248/255, blue: 242/255, alpha: 1)
      default:
        result(FlutterMethodNotImplemented)
        return
      }
      result(nil)
    }

    RegisterGeneratedPlugins(registry: flutterViewController)
    super.awakeFromNib()
  }
}
