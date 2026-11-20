import 'dart:io';
import 'dart:collection';
import 'update_prompt.dart';
import 'desktop_frame.dart';
import 'shell_theme.dart';
import 'shell_interactions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

const homeUrl = 'https://opdracht.zerver.eu/';
const trustedHosts = {'opdracht.zerver.eu', 'authentik.zerver.eu'};

bool isInternal(Uri url) => url.scheme == 'https' && trustedHosts.contains(url.host) && (url.port == 443);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  WebViewEnvironment? environment;
  if (Platform.isWindows) {
    if (await WebViewEnvironment.getAvailableVersion() == null) {
      runApp(MaterialApp(
        theme: shellTheme(Brightness.light),
        darkTheme: shellTheme(Brightness.dark),
        home: const Scaffold(body: DesktopFrame(child: Center(child: Text(
        'Bitte die Microsoft Edge WebView2 Runtime installieren und Opdracht erneut öffnen.',
        textAlign: TextAlign.center,
      ))))));
      return;
    }
    final base = Platform.environment['LOCALAPPDATA'];
    if (base == null) throw StateError('LOCALAPPDATA is unavailable');
    final directory = Directory('$base/Opdracht/WebView2');
    await directory.create(recursive: true);
    environment = await WebViewEnvironment.create(settings: WebViewEnvironmentSettings(userDataFolder: directory.path));
  }
  runApp(OpdrachtShell(environment: environment));
}

class OpdrachtShell extends StatefulWidget {
  const OpdrachtShell({super.key, this.environment});
  final WebViewEnvironment? environment;
  @override
  State<OpdrachtShell> createState() => _OpdrachtShellState();
}

class _OpdrachtShellState extends State<OpdrachtShell> {
  InAppWebViewController? controller;
  bool canGoBack = false;
  bool loadFailed = false;
  String viewportScript = '';
  String appliedViewportScript = '';
  bool? appliedDark;
  bool datePickerOpen = false;

  Future<void> applyAppearance(bool dark) async {
    if (Platform.isWindows || Platform.isMacOS) {
      await desktopWindow.invokeMethod<void>('theme', dark);
    }
    await controller?.evaluateJavascript(source: shellThemeScript(dark));
  }

  Future<void> applyViewportInsets() async {
    if (controller == null) return;
    await controller!.evaluateJavascript(source: viewportScript);
  }

  Future<void> openExternal(WebUri url) async {
    if (url.scheme == 'https') await InAppBrowser.openWithSystemBrowser(url: url);
  }

  @override
  Widget build(BuildContext context) {
    // Keep OS bars, but do not shrink the entire webview for a side cutout.
    // The website applies these insets to controls rather than its background.
    final insets = MediaQuery.viewPaddingOf(context);
    viewportScript = "if (document.documentElement) { document.documentElement.style.setProperty('--shell-safe-left', '${insets.left}px');"
        "document.documentElement.style.setProperty('--shell-safe-right', '${insets.right}px'); }";
    if (viewportScript != appliedViewportScript) {
      appliedViewportScript = viewportScript;
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) applyViewportInsets(); });
    }
    final dark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final desktop = Platform.isWindows || Platform.isMacOS;
    if (appliedDark != dark) {
      appliedDark = dark;
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) applyAppearance(dark); });
    }
    final background = dark ? const Color(0xff171d19) : const Color(0xfff7f8f2);
    final systemStyle = SystemUiOverlayStyle(
      statusBarColor: background,
      systemNavigationBarColor: background,
      systemNavigationBarDividerColor: background,
      statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
      statusBarBrightness: dark ? Brightness.dark : Brightness.light,
      systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
    );
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: systemStyle,
      child: MaterialApp(
      title: 'Opdracht',
      themeMode: ThemeMode.system,
      theme: shellTheme(Brightness.light),
      darkTheme: shellTheme(Brightness.dark),
      home: UpdatePrompt(child: PopScope(
        canPop: !canGoBack,
        onPopInvokedWithResult: (didPop, result) async {
          if (!didPop && controller != null) await controller!.goBack();
        },
        child: Scaffold(
          body: Builder(builder: (context) {
          final content = SafeArea(left: false, right: false, top: !desktop, bottom: !desktop, child: Stack(children: [
          InAppWebView(
            webViewEnvironment: widget.environment,
            initialUserScripts: UnmodifiableListView([
              UserScript(source: viewportScript + shellThemeScript(dark) + shellInteractionScript + (Platform.isAndroid ? shellAndroidDateScript : ''), injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START),
            ]),
            initialUrlRequest: URLRequest(url: WebUri(homeUrl)),
            initialSettings: InAppWebViewSettings(
              transparentBackground: true,
              useShouldOverrideUrlLoading: true,
              supportMultipleWindows: true,
              supportZoom: false,
              builtInZoomControls: false,
              displayZoomControls: false,
              minimumZoomScale: 1.0,
              maximumZoomScale: 1.0,
              javaScriptCanOpenWindowsAutomatically: false,
              isInspectable: false,
              allowFileAccess: false,
              allowContentAccess: false,
            ),
            onWebViewCreated: (value) {
              controller = value;
              if (Platform.isAndroid) {
                value.addJavaScriptHandler(handlerName: 'opdrachtDatePicker', callback: (args) async {
                  final url = await value.getUrl();
                  if (!mounted || datePickerOpen || url == null ||
                      !isInternal(Uri.parse(url.toString())) || url.host != 'opdracht.zerver.eu' ||
                      args.length != 1 || args.first is! Map) return null;
                  datePickerOpen = true;
                  try {
                    return await pickShellDate(context, Map<String, dynamic>.from(args.first as Map));
                  } finally {
                    datePickerOpen = false;
                  }
                });
              }
            },
            shouldOverrideUrlLoading: (view, action) async {
              final url = action.request.url;
              if (url == null) return NavigationActionPolicy.CANCEL;
              if (isInternal(Uri.parse(url.toString()))) return NavigationActionPolicy.ALLOW;
              if (action.isForMainFrame) await openExternal(url);
              return NavigationActionPolicy.CANCEL;
            },
            onCreateWindow: (view, action) async {
              final url = action.request.url;
              if (url != null) {
                if (isInternal(Uri.parse(url.toString()))) {
                  await view.loadUrl(urlRequest: URLRequest(url: url));
                } else {
                  await openExternal(url);
                }
              }
              return false;
            },
            onLoadStart: (view, url) { if (mounted) setState(() => loadFailed = false); },
            onLoadStop: (view, url) async {
              await applyViewportInsets();
              if (!mounted) return;
              await applyAppearance(MediaQuery.platformBrightnessOf(context) == Brightness.dark);
              final back = await view.canGoBack();
              if (mounted) setState(() => canGoBack = back);
            },
            onUpdateVisitedHistory: (view, url, isReload) async {
              final back = await view.canGoBack();
              if (mounted) setState(() => canGoBack = back);
            },
            onReceivedError: (view, request, error) {
              if (request.isForMainFrame == true && mounted) setState(() => loadFailed = true);
            },
          ),
          if (loadFailed) Positioned.fill(child: ColoredBox(
            color: background,
            child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('Opdracht ist gerade nicht erreichbar.'),
              TextButton(onPressed: () { setState(() => loadFailed = false); controller?.loadUrl(urlRequest: URLRequest(url: WebUri(homeUrl))); }, child: const Text('Erneut versuchen')),
            ])),
          )),
        ]));
          return desktop ? DesktopFrame(macOS: Platform.isMacOS, child: content) : content;
          }),
        ),
      )),
    ));
  }
}
