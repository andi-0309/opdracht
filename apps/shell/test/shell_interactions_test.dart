import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opdracht/shell_interactions.dart';
import 'package:opdracht/shell_theme.dart';

void main() {
  test('date bridge accepts only real ISO dates in the supported calendar', () {
    expect(shellDate('2028-02-29'), DateTime(2028, 2, 29));
    for (final value in [null, 3, '2026-02-29', '2026-13-01', '0000-01-01', '20.11.2026', '2026-11-20T00:00:00Z']) {
      expect(shellDate(value), isNull);
    }
  });

  for (final brightness in Brightness.values) {
    testWidgets('Material 3 picker preserves dates on cancel and returns ISO on accept (${brightness.name})', (tester) async {
      String? result = 'unchanged';
      await tester.pumpWidget(MaterialApp(
        theme: shellTheme(brightness),
        home: Scaffold(body: Builder(builder: (context) => TextButton(
          onPressed: () async { result = await pickShellDate(context, {'value': '2026-11-20'}); },
          child: const Text('Datum öffnen'),
        ))),
      ));
      await tester.tap(find.text('Datum öffnen'));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsOneWidget);
      expect(Theme.of(tester.element(find.byType(DatePickerDialog))).useMaterial3, isTrue);
      await tester.tap(find.text('Abbrechen'));
      await tester.pumpAndSettle();
      expect(result, isNull);
      await tester.tap(find.text('Datum öffnen'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('24'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Übernehmen'));
      await tester.pumpAndSettle();
      expect(result, '2026-11-24');
    });
  }

  testWidgets('picker clamps initial date to input limits and rejects an inverted range', (tester) async {
    String? result;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Builder(builder: (context) => TextButton(
      onPressed: () async {
        result = await pickShellDate(context, {'value': '2026-01-01', 'min': '2026-11-20', 'max': '2026-11-25'});
      },
      child: const Text('Öffnen'),
    )))));
    await tester.tap(find.text('Öffnen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Übernehmen'));
    await tester.pumpAndSettle();
    expect(result, '2026-11-20');
    final context = tester.element(find.byType(TextButton).first);
    expect(await pickShellDate(context, {'min': '2026-11-25', 'max': '2026-11-20'}), isNull);
    expect(find.byType(DatePickerDialog), findsNothing);
  });
}
