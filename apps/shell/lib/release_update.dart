import 'dart:convert';
import 'dart:io';

const shellVersion = String.fromEnvironment('APP_VERSION', defaultValue: '0.6.2');
const repositoryUrl = 'https://github.com/andi-0309/opdracht';
const obtainiumLink = 'obtainium://add/https://github.com/andi-0309/opdracht';
final obtainiumWebLink = Uri.https('apps.obtainium.imranr.dev', '/redirect', {
  'r': 'obtainium://app/${Uri.encodeComponent(jsonEncode({
    'id': 'eu.zerver.opdracht',
    'url': repositoryUrl,
    'author': 'andi-0309',
    'name': 'Opdracht',
  }))}',
});

List<int>? versionParts(String value) {
  final match = RegExp(r'^v?(\d+)\.(\d+)\.(\d+)$').firstMatch(value);
  return match == null ? null : [for (var i = 1; i <= 3; i++) int.parse(match.group(i)!)];
}

bool isNewerVersion(String candidate, String installed) {
  final next = versionParts(candidate);
  final current = versionParts(installed);
  if (next == null || current == null) return false;
  for (var i = 0; i < 3; i++) {
    if (next[i] != current[i]) return next[i] > current[i];
  }
  return false;
}

String? assetForPlatform(String platform) => switch (platform) {
  'android' => 'Opdracht-Android.apk',
  'windows' => 'Opdracht-Windows-x64-Setup.exe',
  'macos' => 'Opdracht-macOS-arm64.dmg',
  _ => null,
};

class ReleaseUpdate {
  const ReleaseUpdate(this.version, this.download, this.size);
  final String version;
  final Uri download;
  final int size;

  static ReleaseUpdate? fromJson(Map<String, dynamic> json, String platform, String installed) {
    final tag = json['tag_name'];
    if (json['draft'] != false || json['prerelease'] != false ||
        tag is! String || !isNewerVersion(tag, installed)) return null;
    final expected = assetForPlatform(platform);
    if (expected == null || json['assets'] is! List) return null;
    for (final asset in json['assets'] as List) {
      if (asset is! Map || asset['name'] != expected || asset['state'] != 'uploaded' ||
          asset['size'] is! int || asset['size'] <= 0) continue;
      final url = Uri.tryParse(asset['browser_download_url'] is String ? asset['browser_download_url'] as String : '');
      if (url != null && url.scheme == 'https' && url.host == 'github.com' &&
          url.port == 443 && url.userInfo.isEmpty && url.query.isEmpty && url.fragment.isEmpty &&
          url.path == '/andi-0309/opdracht/releases/download/$tag/$expected') {
        return ReleaseUpdate(tag.replaceFirst(RegExp(r'^v'), ''), url, asset['size'] as int);
      }
    }
    return null;
  }
}

Future<ReleaseUpdate?> checkForUpdate() async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 10);
  try {
    final request = await client.getUrl(Uri.https('api.github.com', '/repos/andi-0309/opdracht/releases/latest'));
    request.headers.set(HttpHeaders.acceptHeader, 'application/vnd.github+json');
    request.headers.set(HttpHeaders.userAgentHeader, 'Opdracht/$shellVersion');
    final response = await request.close().timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) throw const HttpException('Release-Abfrage fehlgeschlagen');
    final bytes = <int>[];
    await for (final chunk in response.timeout(const Duration(seconds: 15))) {
      bytes.addAll(chunk);
      if (bytes.length > 1024 * 1024) throw const FormatException('Release-Antwort zu groß');
    }
    final json = jsonDecode(utf8.decode(bytes));
    if (json is! Map<String, dynamic>) throw const FormatException('Ungültige Release-Antwort');
    return ReleaseUpdate.fromJson(json, Platform.operatingSystem, shellVersion);
  } finally {
    client.close(force: true);
  }
}
