import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opdracht/release_update.dart';
import 'package:opdracht/update_prompt.dart';

void main() {
  testWidgets('checks once on startup and adds no chrome when current', (tester) async {
    var checks = 0;
    await tester.pumpWidget(MaterialApp(home: UpdatePrompt(
      loadUpdate: () async { checks++; return null; },
      child: const Scaffold(body: Text('Website')),
    )));
    await tester.pumpAndSettle();
    expect(checks, 1);
    expect(find.text('Website'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.byType(IconButton), findsNothing);
    expect(find.byType(BottomAppBar), findsNothing);
  });
  testWidgets('new release opens a dismissible update modal', (tester) async {
    await tester.pumpWidget(MaterialApp(home: UpdatePrompt(
      loadUpdate: () async => ReleaseUpdate('0.7.0', Uri.parse('$repositoryUrl/releases/download/v0.7.0/Opdracht-Windows-x64-Setup.exe'), 100),
      child: const Scaffold(body: Text('Website')),
    )));
    await tester.pumpAndSettle();
    expect(find.text('Opdracht 0.7.0 verfügbar'), findsOneWidget);
    expect(find.text('Update herunterladen'), findsOneWidget);
    await tester.tap(find.text('Schließen'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Website'), findsOneWidget);
  });
  testWidgets('one click downloads and opens, with progress and no duplicate launch', (tester) async {
    final downloaded = Completer<File>();
    final file = File('Opdracht-Android.apk');
    final release = ReleaseUpdate(
      '0.7.0',
      Uri.parse('$repositoryUrl/releases/download/v0.7.0/Opdracht-Android.apk'),
      100,
    );
    final launched = <File>[];
    await tester.pumpWidget(MaterialApp(home: UpdatePrompt(
      loadUpdate: () async => release,
      download: (update, onProgress) {
        expect(update, same(release));
        onProgress(0.5);
        return downloaded.future;
      },
      open: (installer) async {
        launched.add(installer);
        return true;
      },
      child: const Scaffold(body: Text('Website')),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Update herunterladen'));
    await tester.pump();
    expect(tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, 0.5);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
    expect(launched, isEmpty);

    downloaded.complete(file);
    await tester.pumpAndSettle();
    expect(launched, [file]);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('failed download stays in the app and allows a retry', (tester) async {
    final file = File('Opdracht-Android.apk');
    var attempts = 0;
    await tester.pumpWidget(MaterialApp(home: UpdatePrompt(
      loadUpdate: () async => ReleaseUpdate(
        '0.7.0',
        Uri.parse('$repositoryUrl/releases/download/v0.7.0/Opdracht-Android.apk'),
        100,
      ),
      download: (update, onProgress) async {
        if (++attempts == 1) throw const SocketException('Offline');
        return file;
      },
      open: (installer) async => false,
      child: const Scaffold(body: Text('Website')),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Update herunterladen'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Download ist fehlgeschlagen'), findsOneWidget);
    await tester.tap(find.text('Update herunterladen'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Installation aus dieser Quelle'), findsOneWidget);
    expect(find.text('Installer öffnen'), findsOneWidget);
    expect(attempts, 2);
  });

  testWidgets('offline check never blocks or replaces the website', (tester) async {
    await tester.pumpWidget(MaterialApp(home: UpdatePrompt(
      loadUpdate: () async => throw Exception('Offline'),
      child: const Scaffold(body: Text('Website')),
    )));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Website'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
  });
}
