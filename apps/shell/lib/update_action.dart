import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'release_update.dart';

class UpdateAction extends StatefulWidget {
  const UpdateAction({super.key});
  @override
  State<UpdateAction> createState() => _UpdateActionState();
}

class _UpdateActionState extends State<UpdateAction> {
  bool checking = false;
  ReleaseUpdate? available;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => check(automatic: true));
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

  Future<void> check({bool automatic = false}) async {
    if (checking) return;
    setState(() => checking = true);
    try {
      final update = await checkForUpdate();
      if (!mounted) return;
      setState(() => available = update);
      if (!automatic || update != null) await showUpdate(update);
    } catch (_) {
      if (mounted && !automatic) {
        await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
          title: const Text('Update-Prüfung nicht möglich'),
          content: const Text('GitHub ist gerade nicht erreichbar oder das Anfragelimit ist erreicht. Bitte später erneut versuchen.'),
          actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Schließen'))],
        ));
      }
    } finally {
      if (mounted) setState(() => checking = false);
    }
  }

  Future<void> showUpdate(ReleaseUpdate? update) async {
    await showDialog<void>(context: context, builder: (dialogContext) => AlertDialog(
      title: Text(update == null ? 'Opdracht ist aktuell' : 'Opdracht ${update.version} verfügbar'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Installierte App-Version: $shellVersion'),
        const SizedBox(height: 12),
        Text(update == null
          ? 'Keine neuere passende App-Version gefunden. Website-Änderungen sind unabhängig davon sofort verfügbar.'
          : Platform.isAndroid
            ? 'APK herunterladen und öffnen. Android fragt vor der Installation. Die bestehende App wird aktualisiert, nicht deinstalliert.'
            : 'ZIP herunterladen und entpacken. Opdracht schließen und die bisherige Anwendung durch die neue ersetzen. Das WebView-Profil bleibt erhalten.'),
        if (Platform.isAndroid) ...[
          const SizedBox(height: 12),
          const Text('Alternativ kann Obtainium die APK-Updates von GitHub verwalten.'),
          TextButton(onPressed: () => launch(obtainiumWebLink), child: const Text('In Obtainium hinzufügen')),
        ],
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Schließen')),
        if (update != null) FilledButton(onPressed: () => launch(update.download), child: const Text('Update herunterladen')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) => IconButton.filledTonal(
    tooltip: available == null ? 'App-Updates prüfen' : 'App-Update verfügbar',
    onPressed: checking ? null : () => check(),
    icon: checking
      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
      : Icon(available == null ? Icons.system_update_alt : Icons.download),
  );
}
