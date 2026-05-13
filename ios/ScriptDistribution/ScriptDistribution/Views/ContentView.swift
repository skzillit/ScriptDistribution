//
//  ContentView.swift
//
//  Root view — just wraps the Sides list in a NavigationStack since Sides is the
//  only screen (matches the slimmed-down Android bottom-nav with Scripts and
//  Analytics removed).
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            SidesListView()
        }
    }
}

#Preview {
    ContentView()
}
