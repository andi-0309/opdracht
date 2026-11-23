import 'dart:io';

import 'package:flutter/services.dart';

import 'release_update.dart';

const _installerChannel = MethodChannel('eu.zerver.opdracht/installer');
const _downloadHosts = {
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
};
const _networkTimeout = Duration(seconds: 20);

Future<File> downloadInstaller(
  ReleaseUpdate update,
  void Function(double) onProgress,
) async {
  final tempPath = Platform.isAndroid
      ? (await _installerChannel.invokeMethod<String>('cacheDirectory'))!
      : Directory.systemTemp.path;
  final cache = Directory('$tempPath${Platform.pathSeparator}opdracht-updates');
  await cache.create(recursive: true);

  // Keep recently handed-off installers available to the OS.
  final expiry = DateTime.now().subtract(const Duration(days: 7));
  await for (final entry in cache.list(followLinks: false)) {
    if (entry is! Directory ||
        !entry.uri.pathSegments.reversed.firstWhere((part) => part.isNotEmpty).startsWith('update-')) {
      continue;
    }
    try {
      if ((await entry.stat()).modified.isBefore(expiry)) {
        await entry.delete(recursive: true);
      }
    } on FileSystemException {
      // An installer can still be in use.
    }
  }

  final directory = await cache.createTemp('update-');
  final filename = update.download.pathSegments.last;
  final file = File('${directory.path}${Platform.pathSeparator}$filename');
  final client = HttpClient()..connectionTimeout = _networkTimeout;
  try {
    final response = await _requestAsset(client, update.download);
    if (response.statusCode != HttpStatus.ok ||
        (response.contentLength >= 0 && response.contentLength != update.size)) {
      throw const HttpException('Unexpected installer response');
    }
    final output = await file.open(mode: FileMode.write);
    var received = 0;
    try {
      await for (final chunk in response.timeout(_networkTimeout)) {
        received += chunk.length;
        if (received > update.size) throw const HttpException('Installer is too large');
        await output.writeFrom(chunk);
        onProgress(received / update.size);
      }
    } finally {
      await output.close();
    }
    if (received != update.size) throw const HttpException('Incomplete installer');
    return file;
  } catch (_) {
    try {
      await directory.delete(recursive: true);
    } on FileSystemException {
      // Preserve the original download error.
    }
    rethrow;
  } finally {
    client.close(force: true);
  }
}

Future<HttpClientResponse> _requestAsset(HttpClient client, Uri url) async {
  for (var hop = 0; hop < 5; hop++) {
    if (url.scheme != 'https' || url.port != 443 || url.userInfo.isNotEmpty ||
        !_downloadHosts.contains(url.host)) {
      throw const HttpException('Untrusted installer host');
    }
    final request = await client.getUrl(url).timeout(_networkTimeout);
    request.followRedirects = false;
    request.headers.set(HttpHeaders.acceptEncodingHeader, 'identity');
    final response = await request.close().timeout(_networkTimeout);
    if (!response.isRedirect) return response;
    final location = response.headers.value(HttpHeaders.locationHeader);
    if (location == null) break;
    await response.timeout(_networkTimeout).drain<void>();
    url = url.resolve(location);
  }
  throw const HttpException('Invalid installer redirect');
}

/// Returns false when Android first needs permission to install from Opdracht.
Future<bool> openInstaller(File file) async {
  if (Platform.isWindows) {
    await Process.start(
      file.path,
      [],
      workingDirectory: file.parent.path,
      mode: ProcessStartMode.detached,
    );
    return true;
  }
  return (await _installerChannel.invokeMethod<bool>('open', file.path))!;
}
