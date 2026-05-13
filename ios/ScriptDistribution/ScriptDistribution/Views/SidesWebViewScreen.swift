//
//  SidesWebViewScreen.swift
//
//  Full-screen wrapper around `SidesWebView` with a navigation bar title.
//

import SwiftUI

struct SidesWebViewScreen: View {

    let title: String
    let url: URL
    @State private var loading = false

    var body: some View {
        ZStack {
            SidesWebView(url: url, isLoading: $loading)
                .ignoresSafeArea(edges: .bottom)
            if loading {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(1.4)
                    .tint(.accentColor)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
