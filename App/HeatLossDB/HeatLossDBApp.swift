//
//  HeatLossDBApp.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 29/02/2024.
//

import SwiftUI
import SwiftData

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
        }
        .modelContainer(modelContainer)
    }
}
