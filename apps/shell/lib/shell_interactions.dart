import 'package:flutter/material.dart';

DateTime? shellDate(Object? value) {
  if (value is! String || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) return null;
  final date = DateTime.tryParse(value);
  if (date == null || date.year < 1 || date.year > 9999) return null;
  final formatted = '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  return formatted == value ? date : null;
}

Future<String?> pickShellDate(BuildContext context, Map<String, dynamic> request) async {
  final first = shellDate(request['min']) ?? DateTime(1);
  final last = shellDate(request['max']) ?? DateTime(9999, 12, 31);
  if (last.isBefore(first)) return null;
  var initial = shellDate(request['value']) ?? DateUtils.dateOnly(DateTime.now());
  if (initial.isBefore(first)) initial = first;
  if (initial.isAfter(last)) initial = last;
  final selected = await showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: first,
    lastDate: last,
    helpText: 'Datum auswählen',
    cancelText: 'Abbrechen',
    confirmText: 'Übernehmen',
    fieldLabelText: 'Datum',
    errorFormatText: 'Bitte ein gültiges Datum eingeben.',
    errorInvalidText: 'Datum liegt außerhalb des erlaubten Bereichs.',
  );
  return selected == null ? null
      : '${selected.year.toString().padLeft(4, '0')}-${selected.month.toString().padLeft(2, '0')}-${selected.day.toString().padLeft(2, '0')}';
}

// Injected only by the native shell, leaving ordinary browser zoom untouched.
const shellInteractionScript = r"""
(() => {
  if (window.__opdrachtInteractions) return;
  window.__opdrachtInteractions = true;
  const lockViewport = () => {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.append(viewport);
    }
    viewport.content = viewport.content.split(',').filter(part =>
      !/^\s*(maximum-scale|minimum-scale|user-scalable)\s*=/i.test(part)
    ).concat(['maximum-scale=1', 'minimum-scale=1', 'user-scalable=no']).join(',');
    document.documentElement.style.touchAction = 'pan-x pan-y';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lockViewport, {once: true});
  else lockViewport();
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
  }, {passive: false});
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0', 'Add', 'Subtract'].includes(event.key)) {
      event.preventDefault();
    }
  }, {capture: true});
  document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey || event.altKey || location.hostname !== 'opdracht.zerver.eu') return;
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    for (let node = event.target; node instanceof Element; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX;
      if (!['auto', 'scroll'].includes(overflow) || node.scrollWidth <= node.clientWidth) continue;
      const step = delta * (event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? node.clientWidth : 1);
      node.scrollLeft += step;
      // Always consume at the edge, rather than unexpectedly scrolling the page.
      event.preventDefault();
      return;
    }
  }, {passive: false, capture: true});
  document.addEventListener('gesturestart', event => event.preventDefault(), {passive: false});
  document.addEventListener('gesturechange', event => event.preventDefault(), {passive: false});
})();
""";

const shellAndroidDateScript = r"""
(() => {
  if (location.hostname !== 'opdracht.zerver.eu' || window.__opdrachtDatePicker) return;
  window.__opdrachtDatePicker = true;
  let pending = false;
  document.addEventListener('click', async event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'date' || input.disabled || input.readOnly) return;
    if (!window.flutter_inappwebview?.callHandler) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    const previous = input.value;
    try {
      const value = await window.flutter_inappwebview.callHandler('opdrachtDatePicker', {
        value: previous, min: input.min, max: input.max
      });
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          input.isConnected && input.value === previous) {
        input.value = value;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
      }
    } catch (_) {
      // Keep the existing date if the native bridge is no longer available.
    } finally {
      pending = false;
      if (input.isConnected) input.focus();
    }
  }, {capture: true});
})();
""";
