import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'release_update.dart';
import 'update_installer.dart';

class UpdatePrompt extends StatefulWidget {
  const UpdatePrompt({
    super.key,
    required this.child,
    this.loadUpdate = checkForUpdate,
    this.download = downloadInstaller,
    this.open = openInstaller,
  });

  final Widget child;
  final Future<ReleaseUpdate?> Function() loadUpdate;
  final Future<File> Function(ReleaseUpdate, void Function(double)) download;
  final Future<bool> Function(File) open;

  @override
  State<UpdatePrompt> createState() => _UpdatePromptState();
}

class _UpdatePromptState extends State<UpdatePrompt> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => check());
  }

  Future<void> check() async {
    ReleaseUpdate? update;
    try {
      update = await widget.loadUpdate();
    } catch (_) {
      // Offline and rate-limited checks must not interrupt the website.
      return;
    }
    if (!mounted || update == null) return;
    final release = update;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _UpdateDialog(
        update: release,
        download: widget.download,
        open: widget.open,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.update, required this.download, required this.open});

  final ReleaseUpdate update;
  final Future<File> Function(ReleaseUpdate, void Function(double)) download;
  final Future<bool> Function(File) open;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  File? installer;
  double? progress;
  bool busy = false;
  String? message;

  Future<void> install() async {
    setState(() {
      busy = true;
      progress = null;
      message = null;
    });
    try {
      if (installer != null && !await installer!.exists()) installer = null;
      installer ??= await widget.download(widget.update, (value) {
        if (mounted) setState(() => progress = value);
      });
      if (!mounted) return;
      if (await widget.open(installer!)) {
        if (mounted) Navigator.of(context).pop();
      } else if (mounted) {
        setState(() {
          message = 'Erlaube Android die Installation aus dieser Quelle. Kehre dann zurück und tippe auf „Installer öffnen“.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          message = installer == null
              ? 'Der Download ist fehlgeschlagen. Bitte versuche es erneut.'
              : 'Der Installer konnte nicht geöffnet werden. Bitte versuche es erneut.';
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> openObtainium() async {
    try {
      await InAppBrowser.openWithSystemBrowser(url: WebUri(obtainiumWebLink.toString()));
    } catch (_) {
      if (mounted) setState(() => message = 'Obtainium konnte nicht geöffnet werden.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = installer == null ? 'Update wird heruntergeladen …' : 'Installer wird geöffnet …';
    return PopScope(
      canPop: !busy,
      child: AlertDialog(
        title: Text('Opdracht ${widget.update.version} verfügbar'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Installierte App-Version: $shellVersion'),
              const SizedBox(height: 12),
              Text(Platform.isAndroid
                  ? 'Android fragt vor der Installation. Die bestehende App wird aktualisiert.'
                  : Platform.isMacOS
                      ? 'Opdracht beenden und die neue App aus dem geöffneten Installationsabbild in „Programme“ ziehen.'
                      : 'Das Windows-Setup öffnet sich nach dem Download. Bei einer bestehenden Installation bleibt die Anmeldung erhalten.'),
              if (Platform.isAndroid && !busy && installer == null)
                TextButton(onPressed: openObtainium, child: const Text('In Obtainium hinzufügen')),
              if (busy) ...[
                const SizedBox(height: 16),
                Text(status),
                const SizedBox(height: 8),
                LinearProgressIndicator(value: installer == null ? progress : null, semanticsLabel: status),
              ],
              if (message != null) ...[
                const SizedBox(height: 12),
                Text(message!),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: busy ? null : () => Navigator.of(context).pop(),
            child: const Text('Schließen'),
          ),
          FilledButton(
            onPressed: busy ? null : install,
            child: Text(installer == null ? 'Update herunterladen' : 'Installer öffnen'),
          ),
        ],
      ),
    );
  }
}
