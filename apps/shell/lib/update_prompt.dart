import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'release_update.dart';

class UpdatePrompt extends StatefulWidget {
  const UpdatePrompt({super.key, required this.child, this.loadUpdate = checkForUpdate});
  final Widget child;
  final Future<ReleaseUpdate?> Function() loadUpdate;
  @override
  State<UpdatePrompt> createState() => _UpdatePromptState();
}

class _UpdatePromptState extends State<UpdatePrompt> {

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => check());
  }

  Future<void> launch(Uri url) async {
    try {
      await InAppBrowser.openWithSystemBrowser(url: WebUri(url.toString()));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Der Browser konnte nicht geöffnet werden.')));
      }
    }
  }

  Future<void> check() async {
    try {
      final update = await widget.loadUpdate();
      if (mounted && update != null) await showUpdate(update);
    } catch (_) {
      // Offline and rate-limited checks must not interrupt the website.
    }
  }

  Future<void> showUpdate(ReleaseUpdate update) async {
    await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
      title: Text('Opdracht ${update.version} verfügbar'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Installierte App-Version: $shellVersion'),
        const SizedBox(height: 12),
        Text(Platform.isAndroid
            ? 'APK herunterladen und öffnen. Android fragt vor der Installation. Die bestehende App wird aktualisiert, nicht deinstalliert.'
            : Platform.isWindows
                ? 'Installer herunterladen, Opdracht schließen und das Setup starten. Die bestehende Installation wird aktualisiert; die Anmeldung bleibt erhalten.'
                : 'ZIP herunterladen und entpacken. Opdracht schließen und die bisherige Anwendung durch die neue ersetzen. Das WebView-Profil bleibt erhalten.'),
        if (Platform.isAndroid) ...[
          const SizedBox(height: 12),
          const Text('Alternativ kann Obtainium die APK-Updates von GitHub verwalten.'),
          TextButton(onPressed: () => launch(obtainiumWebLink), child: const Text('In Obtainium hinzufügen')),
        ],
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Schließen')),
        FilledButton(onPressed: () => launch(update.download), child: const Text('Update herunterladen')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
