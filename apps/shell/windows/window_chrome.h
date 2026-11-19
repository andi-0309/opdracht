#ifndef OPDRACHT_WINDOW_CHROME_H_
#define OPDRACHT_WINDOW_CHROME_H_

#include <dwmapi.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>
#include <memory>
#include <optional>

inline std::unique_ptr<flutter::MethodChannel<flutter::EncodableValue>>
ConfigureOpdrachtWindow(flutter::BinaryMessenger* messenger, HWND window) {
  auto channel = std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
      messenger, "eu.zerver.opdracht/window",
      &flutter::StandardMethodCodec::GetInstance());
  channel->SetMethodCallHandler(
      [window](const flutter::MethodCall<flutter::EncodableValue>& call,
               std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
        const auto& method = call.method_name();
        if (method == "drag") {
          ReleaseCapture();
          PostMessage(window, WM_NCLBUTTONDOWN, HTCAPTION, GetMessagePos());
        } else if (method == "minimize") {
          ShowWindow(window, SW_MINIMIZE);
        } else if (method == "maximize") {
          ShowWindow(window, IsZoomed(window) ? SW_RESTORE : SW_MAXIMIZE);
        } else if (method == "close") {
          PostMessage(window, WM_CLOSE, 0, 0);
        } else if (method == "resize") {
          const auto* edge = call.arguments()
              ? std::get_if<int32_t>(call.arguments()) : nullptr;
          if (!edge || *edge < 1 || *edge > 8) {
            result->Error("invalid_edge", "Unknown resize edge");
            return;
          }
          if (!IsZoomed(window)) {
            ReleaseCapture();
            PostMessage(window, WM_SYSCOMMAND, SC_SIZE + *edge, 0);
          }
        } else if (method == "theme") {
          const auto* value = call.arguments()
              ? std::get_if<bool>(call.arguments()) : nullptr;
          if (!value) {
            result->Error("invalid_theme", "Expected brightness boolean");
            return;
          }
          const BOOL dark = *value;
          const COLORREF border = dark ? RGB(59, 72, 59) : RGB(220, 227, 213);
          const DWORD rounded = 2;
          DwmSetWindowAttribute(window, 20, &dark, sizeof(dark));
          DwmSetWindowAttribute(window, 33, &rounded, sizeof(rounded));
          DwmSetWindowAttribute(window, 34, &border, sizeof(border));
        } else {
          result->NotImplemented();
          return;
        }
        result->Success();
      });
  const MARGINS shadow = {1, 1, 1, 1};
  DwmExtendFrameIntoClientArea(window, &shadow);
  SetWindowPos(window, nullptr, 0, 0, 0, 0,
               SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
  return channel;
}

inline std::optional<LRESULT> OpdrachtChromeMessage(
    HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  if (message == WM_NCCALCSIZE && wparam) {
    if (IsZoomed(window)) {
      auto* params = reinterpret_cast<NCCALCSIZE_PARAMS*>(lparam);
      const UINT dpi = GetDpiForWindow(window);
      const int padding = GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
      const int x = GetSystemMetricsForDpi(SM_CXSIZEFRAME, dpi) + padding;
      const int y = GetSystemMetricsForDpi(SM_CYSIZEFRAME, dpi) + padding;
      InflateRect(&params->rgrc[0], -x, -y);
    }
    return 0;
  }
  if (message == WM_GETMINMAXINFO) {
    DefWindowProc(window, message, wparam, lparam);
    auto* info = reinterpret_cast<MINMAXINFO*>(lparam);
    const UINT dpi = GetDpiForWindow(window);
    info->ptMinTrackSize = {MulDiv(480, dpi, 96), MulDiv(360, dpi, 96)};
    return 0;
  }
  return std::nullopt;
}
#endif
