import 'package:flutter_test/flutter_test.dart';
import 'package:opdracht/main.dart';

void main() {
  test('only HTTPS application and OIDC provider stay in the webview', () {
    expect(isInternal(Uri.parse(homeUrl)), isTrue);
    expect(isInternal(Uri.parse('https://authentik.zerver.eu/application/o/authorize/')), isTrue);
    for (final url in ['http://opdracht.zerver.eu', 'https://opdracht.zerver.eu.evil.org', 'file:///etc/passwd', 'javascript:alert(1)', 'https://opdracht.zerver.eu:444']) {
      expect(isInternal(Uri.parse(url)), isFalse);
    }
  });
}
