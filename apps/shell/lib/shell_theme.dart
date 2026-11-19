import 'package:flutter/material.dart';

ThemeData shellTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final background = Color(dark ? 0xff171d19 : 0xfff7f8f2);
  final primary = Color(dark ? 0xffb5d39a : 0xff243f2c);
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    scaffoldBackgroundColor: background,
    colorScheme: ColorScheme.fromSeed(seedColor: primary, brightness: brightness).copyWith(
      primary: primary,
      onPrimary: Color(dark ? 0xff1c2b1c : 0xffffffff),
      surface: background,
      onSurface: Color(dark ? 0xffe4ecdf : 0xff24352d),
      onSurfaceVariant: Color(dark ? 0xffacb9a8 : 0xff637268),
      outlineVariant: Color(dark ? 0xff3b483b : 0xffdce3d5),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Color(dark ? 0xff232b25 : 0xffffffff),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
  );
}

String shellThemeScript(bool dark) => """
if (location.hostname === 'opdracht.zerver.eu') {
  window.__opdrachtTheme = '${dark ? 'dark' : 'light'}';
  if (document.documentElement) {
    document.documentElement.dataset.theme = window.__opdrachtTheme;
    document.documentElement.style.colorScheme = window.__opdrachtTheme;
  }
  window.dispatchEvent(new Event('opdracht:theme'));
}
""";
