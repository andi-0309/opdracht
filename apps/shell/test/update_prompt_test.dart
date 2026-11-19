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
      loadUpdate: () async => ReleaseUpdate('0.7.0', Uri.parse('$repositoryUrl/releases/download/v0.7.0/Opdracht-Windows-x64-Setup.exe')),
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
