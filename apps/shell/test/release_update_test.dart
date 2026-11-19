import 'package:flutter_test/flutter_test.dart';
import 'package:opdracht/release_update.dart';

Map<String, dynamic> release({String tag = 'v0.7.0', String platform = 'android'}) => {
  'tag_name': tag,
  'draft': false,
  'prerelease': false,
  'assets': [{
    'name': assetForPlatform(platform),
    'state': 'uploaded',
    'size': 100,
    'browser_download_url': '$repositoryUrl/releases/download/$tag/${assetForPlatform(platform)}',
  }],
};

void main() {
  test('compares numeric stable versions and never offers a downgrade', () {
    expect(isNewerVersion('v0.10.0', '0.9.9'), isTrue);
    expect(isNewerVersion('v1.0.0', '0.99.9'), isTrue);
    for (final version in ['v0.6.1', 'v0.6.0', 'invalid', 'v0.7.0-rc1']) {
      expect(isNewerVersion(version, '0.6.1'), isFalse);
    }
  });
  test('selects only the correct platform asset including Silicon-only Mac', () {
    for (final platform in ['android', 'windows', 'macos']) {
      final update = ReleaseUpdate.fromJson(release(platform: platform), platform, '0.6.1');
      expect(update?.version, '0.7.0');
      expect(update?.download.path, endsWith(assetForPlatform(platform)!));
    }
    expect(ReleaseUpdate.fromJson(release(), 'macos', '0.6.1'), isNull);
    expect(ReleaseUpdate.fromJson(release(), 'linux', '0.6.1'), isNull);
  });
  test('ignores drafts, prereleases, old versions and unfinished uploads', () {
    for (final key in ['draft', 'prerelease']) {
      expect(ReleaseUpdate.fromJson(release()..[key] = true, 'android', '0.6.1'), isNull);
    }
    expect(ReleaseUpdate.fromJson(release(tag: 'v0.6.0'), 'android', '0.6.1'), isNull);
    final pending = release();
    (pending['assets'] as List).first['state'] = 'new';
    expect(ReleaseUpdate.fromJson(pending, 'android', '0.6.1'), isNull);
    expect(ReleaseUpdate.fromJson({'tag_name': 'v1.0.0'}, 'android', '0.6.1'), isNull);
  });
  test('rejects download substitutions and unsafe URLs', () {
    for (final url in [
      'http://github.com/andi-0309/opdracht/releases/download/v0.7.0/Opdracht-Android.apk',
      'https://github.com.evil.org/andi-0309/opdracht/releases/download/v0.7.0/Opdracht-Android.apk',
      'https://github.com/another/repository/releases/download/v0.7.0/Opdracht-Android.apk',
      'https://github.com/andi-0309/opdracht/releases/download/v0.6.0/Opdracht-Android.apk',
      'https://github.com/andi-0309/opdracht/releases/download/v0.7.0/Opdracht-Android.apk?redirect=evil',
    ]) {
      final data = release();
      (data['assets'] as List).first['browser_download_url'] = url;
      expect(ReleaseUpdate.fromJson(data, 'android', '0.6.1'), isNull);
    }
  });
  test('Obtainium redirect contains the correct Android app source', () {
    expect(obtainiumWebLink.scheme, 'https');
    expect(obtainiumWebLink.host, 'apps.obtainium.imranr.dev');
    expect(obtainiumWebLink.queryParameters['r'], startsWith('obtainium://app/'));
    expect(Uri.decodeComponent(obtainiumWebLink.queryParameters['r']!), contains(repositoryUrl));
    expect(Uri.decodeComponent(obtainiumWebLink.queryParameters['r']!), contains('eu.zerver.opdracht'));
  });
}
