import SwiftUI
import WebKit

struct WangDoKuWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "wangdoku")
        controller.addUserScript(WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.setURLSchemeHandler(LocalContentSchemeHandler.shared, forURLScheme: "wangdoku")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator

        guard var components = URLComponents(string: "wangdoku://app/index.html") else { return webView }
        let language = Locale.preferredLanguages.first ?? "en"
        components.queryItems = [URLQueryItem(name: "lang", value: language)]
        if let url = components.url { webView.load(URLRequest(url: url)) }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "wangdoku", let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            DispatchQueue.main.async {
                if type == "share", let value = body["url"] as? String, let url = URL(string: value) {
                    self.presentShare(url)
                } else {
                    SoundHapticEngine.shared.play(type)
                }
            }
        }

        private func presentShare(_ url: URL) {
            guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
                  let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            root.present(sheet, animated: true)
        }
    }

    private var bridgeScript: String {
        """
        window.__WANGDOKU_NATIVE = true;
        window.__WANGDOKU_PUBLIC_URL = 'https://wangdoku.netlify.app';
        window.addEventListener('wangdoku:feedback', function (event) {
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.wangdoku) {
            window.webkit.messageHandlers.wangdoku.postMessage(event.detail || {});
          }
        });
        """
    }
}

/// Maps wangdoku://app/... to the bundled Web folder, so the existing site's
/// root-relative CSS and JavaScript paths work identically offline.
final class LocalContentSchemeHandler: NSObject, WKURLSchemeHandler {
    static let shared = LocalContentSchemeHandler()

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let requestURL = urlSchemeTask.request.url
        let path = (requestURL?.path ?? "/index.html").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !path.contains(".."),
              let root = Bundle.main.resourceURL?.appendingPathComponent("Web"),
              let data = try? Data(contentsOf: root.appendingPathComponent(path)) else {
            let response = HTTPURLResponse(url: requestURL ?? URL(string: "wangdoku://app/")!, statusCode: 404, httpVersion: nil, headerFields: nil)!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
            return
        }
        let ext = URL(fileURLWithPath: path).pathExtension.lowercased()
        let mimeTypes = ["html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webmanifest": "application/manifest+json", "xml": "application/xml", "txt": "text/plain"]
        let response = URLResponse(url: requestURL!, mimeType: mimeTypes[ext] ?? "application/octet-stream", expectedContentLength: data.count, textEncodingName: ext == "html" || ext == "js" || ext == "css" ? "utf-8" : nil)
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
