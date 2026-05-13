//
//  SidesWebView.swift
//
//  SwiftUI wrapper around WKWebView that loads a URL with the same auth headers
//  the rest of the app sends to the backend. The backend's `moduleAuth`
//  middleware sees the same headers a Retrofit/URLSession call would set.
//
//  This is the iOS equivalent of Android's `SidesWebViewActivity`.
//

import SwiftUI
import WebKit

struct SidesWebView: UIViewRepresentable {

    let url: URL
    @Binding var isLoading: Bool

    init(url: URL, isLoading: Binding<Bool> = .constant(false)) {
        self.url = url
        self._isLoading = isLoading
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoading: $isLoading)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        loadAuthenticatedRequest(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // No-op — URL changes would recreate the view by SwiftUI identity.
    }

    private func loadAuthenticatedRequest(into webView: WKWebView) {
        var request = URLRequest(url: url)
        for (key, value) in AuthHeaders.build(body: nil) {
            request.setValue(value, forHTTPHeaderField: key)
        }
        webView.load(request)
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var isLoading: Bool
        init(isLoading: Binding<Bool>) { self._isLoading = isLoading }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            isLoading = true
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoading = false
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            isLoading = false
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            isLoading = false
        }
    }
}
