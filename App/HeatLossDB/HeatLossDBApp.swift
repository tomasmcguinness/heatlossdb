//
//  HeatLossDBApp.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 29/02/2024.
//

import SwiftUI
import SwiftData

extension View {
    /// The launch screen's navy behind a list or form, and behind its navigation bar.
    func appBackground() -> some View {
        self
            .scrollContentBackground(.hidden)
            .background(Color(.launchBackground))
            .toolbarBackground(Color(.launchBackground), for: .navigationBar)
    }
}

@main
struct HeatLossDBApp: App {
    let modelContainer: ModelContainer = {
        do {
            return try ModelContainer(for: Property.self, Survey.self, Room.self)
        } catch {
            fatalError("Failed to create model container \(error)")
        }
    }()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(ScanRoomModel.shared)
                // The launch screen's navy runs through the app, so it's always dark.
                .preferredColorScheme(.dark)
        }
        .modelContainer(modelContainer)
    }
}
