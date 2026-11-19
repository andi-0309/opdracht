import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

const desktopWindow = MethodChannel('eu.zerver.opdracht/window');

class DesktopFrame extends StatelessWidget {
  const DesktopFrame({super.key, required this.child, this.macOS = false});
  final Widget child;
  final bool macOS;

  Future<void> command(String method, [Object? arguments]) async {
    await desktopWindow.invokeMethod<void>(method, arguments);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final title = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onPanStart: (_) => command('drag'),
      onDoubleTap: () => command('maximize'),
      child: Padding(
        padding: EdgeInsets.only(left: macOS ? 82 : 16),
        child: Row(children: [
          Image.asset('assets/app_icon_32.png', width: 22, height: 22),
          const SizedBox(width: 9),
          Text('opdracht.', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.onSurface)),
        ]),
      ),
    );
    final frame = Column(children: [
      Container(
        height: 44,
        decoration: BoxDecoration(color: colors.surface, border: Border(bottom: BorderSide(color: colors.outlineVariant))),
        child: Row(children: [
          Expanded(child: SizedBox.expand(child: title)),
          if (!macOS) ...[
            _WindowButton(label: 'Minimieren', icon: Icons.remove_rounded, onPressed: () => command('minimize')),
            _WindowButton(label: 'Maximieren / Wiederherstellen', icon: Icons.crop_square_rounded, onPressed: () => command('maximize')),
            _WindowButton(label: 'Schließen', icon: Icons.close_rounded, onPressed: () => command('close'), close: true),
          ],
        ]),
      ),
      Expanded(child: child),
    ]);
    if (macOS) return frame;
    // The native sizing loop retains snapping and keyboard window management.
    return Stack(children: [
      Positioned.fill(child: frame),
      for (final edge in [
        (1, Alignment.centerLeft, SystemMouseCursors.resizeLeftRight, 6.0, null),
        (2, Alignment.centerRight, SystemMouseCursors.resizeLeftRight, 6.0, null),
        (3, Alignment.topCenter, SystemMouseCursors.resizeUpDown, null, 6.0),
        (6, Alignment.bottomCenter, SystemMouseCursors.resizeUpDown, null, 6.0),
        (4, Alignment.topLeft, SystemMouseCursors.resizeUpLeftDownRight, 8.0, 8.0),
        (5, Alignment.topRight, SystemMouseCursors.resizeUpRightDownLeft, 8.0, 8.0),
        (7, Alignment.bottomLeft, SystemMouseCursors.resizeUpRightDownLeft, 8.0, 8.0),
        (8, Alignment.bottomRight, SystemMouseCursors.resizeUpLeftDownRight, 8.0, 8.0),
      ])
        Align(alignment: edge.$2, child: MouseRegion(cursor: edge.$3, child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onPanStart: (_) => command('resize', edge.$1),
          child: SizedBox(width: edge.$4 ?? double.infinity, height: edge.$5 ?? double.infinity),
        ))),
    ]);
  }
}

class _WindowButton extends StatelessWidget {
  const _WindowButton({required this.label, required this.icon, required this.onPressed, this.close = false});
  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  final bool close;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 46,
    height: 44,
    child: IconButton(
      tooltip: label,
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      style: IconButton.styleFrom(
        shape: const RoundedRectangleBorder(),
        hoverColor: close ? Theme.of(context).colorScheme.errorContainer : Theme.of(context).colorScheme.primary.withValues(alpha: .1),
      ),
    ),
  );
}
