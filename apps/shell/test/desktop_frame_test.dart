import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opdracht/desktop_frame.dart';
import 'package:opdracht/shell_theme.dart';

void main() {
  testWidgets('Windows chrome exposes accessible native window actions in both schemes', (tester) async {
    final calls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(desktopWindow, (call) async {
      calls.add(call.method);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(desktopWindow, null));
    for (final brightness in Brightness.values) {
      await tester.pumpWidget(MaterialApp(
        theme: shellTheme(brightness),
        home: const Scaffold(body: DesktopFrame(child: Text('Website'))),
      ));
      expect(find.text('Website'), findsOneWidget);
      expect(find.text('opdracht.'), findsOneWidget);
      await tester.tap(find.byTooltip('Minimieren'));
      await tester.tap(find.byTooltip('Maximieren / Wiederherstellen'));
      await tester.tap(find.byTooltip('Schließen'));
      await tester.pump();
      expect(tester.takeException(), isNull);
    }
    expect(calls, ['minimize', 'maximize', 'close', 'minimize', 'maximize', 'close']);
  });

  testWidgets('Mac chrome leaves window buttons to the system', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: shellTheme(Brightness.dark),
      home: const Scaffold(body: DesktopFrame(macOS: true, child: Text('Website'))),
    ));
    expect(find.byType(IconButton), findsNothing);
    expect(find.text('Website'), findsOneWidget);
  });

  test('native surfaces and primary actions use the exact website palette', () {
    expect(shellTheme(Brightness.light).colorScheme.surface, const Color(0xfff7f8f2));
    expect(shellTheme(Brightness.dark).colorScheme.surface, const Color(0xff171d19));
    expect(shellTheme(Brightness.light).colorScheme.primary, const Color(0xff243f2c));
    expect(shellTheme(Brightness.dark).colorScheme.primary, const Color(0xffb5d39a));
  });
}
