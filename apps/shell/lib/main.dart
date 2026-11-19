import 'dart:io';
import 'update_action.dart';
import 'release_update.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

const homeUrl = 'https://opdracht.zerver.eu/';
const trustedHosts = {'opdracht.zerver.eu', 'authentik.zerver.eu'};

bool isInternal(Uri url) => url.scheme == 'https' && trustedHosts.contains(url.host) && (url.port == 443);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  WebViewEnvironment? environment;
  if (Platform.isWindows) {
    if (await WebViewEnvironment.getAvailableVersion() == null) {
      runApp(const MaterialApp(home: Scaffold(body: Center(child: Text(
        'Bitte die Microsoft Edge WebView2 Runtime installieren und Opdracht erneut öffnen.',
        textAlign: TextAlign.center,
      )))));
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

  Future<void> openExternal(WebUri url) async {
    if (url.scheme == 'https') await InAppBrowser.openWithSystemBrowser(url: url);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Opdracht',
      themeMode: ThemeMode.system,
      theme: ThemeData(brightness: Brightness.light),
      darkTheme: ThemeData(brightness: Brightness.dark),
      home: PopScope(
        canPop: !canGoBack,
        onPopInvokedWithResult: (didPop, result) async {
          if (!didPop && controller != null) await controller!.goBack();
        },
        child: Scaffold(
          bottomNavigationBar: SafeArea(top: false, child: SizedBox(height: 40, child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Opdracht · $shellVersion', style: TextStyle(fontSize: 12)),
              const UpdateAction(),
            ]),
          ))),
          body: SafeArea(child: Stack(children: [
          InAppWebView(
            webViewEnvironment: widget.environment,
            initialUrlRequest: URLRequest(url: WebUri(homeUrl)),
            initialSettings: InAppWebViewSettings(
              useShouldOverrideUrlLoading: true,
              supportMultipleWindows: true,
              javaScriptCanOpenWindowsAutomatically: false,
              isInspectable: false,
              allowFileAccess: false,
              allowContentAccess: false,
            ),
            onWebViewCreated: (value) => controller = value,
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
            color: Theme.of(context).colorScheme.surface,
            child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('Opdracht ist gerade nicht erreichbar.'),
              TextButton(onPressed: () { setState(() => loadFailed = false); controller?.loadUrl(urlRequest: URLRequest(url: WebUri(homeUrl))); }, child: const Text('Erneut versuchen')),
            ])),
          )),
        ]))),
      ),
    );
  }
}
