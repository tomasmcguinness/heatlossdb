//
//  ContentView.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 16/06/2023.
//

import SwiftUI
import SwiftData
import RoomPlan

/// Screens pushed from the Scans list.
enum Route: Hashable {
    case addProperty
    case property(Property)
}

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var properties: [Property]
    @State private var path: [Route] = []
    
    let pub = NotificationCenter.default.publisher(for: NSNotification.Name.NSManagedObjectContextObjectsDidChange)
    
    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if properties.isEmpty {
                    GettingStartedView()
                } else {
                    List {
                        ForEach(properties) { item in
                            NavigationLink(value: Route.property(item)) {
                                Text(item.name)
                            }
                        }
                        .onDelete(perform: deleteItems)
                    }
                }
            }
            .appBackground()
            .navigationTitle("Scans")
            .toolbar {
                if !properties.isEmpty {
                    ToolbarItem {
                        NavigationLink(value: Route.addProperty) {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .addProperty:
                    // Saving swaps the form for the new property, so Back returns to the list.
                    AddPropertyView { property in path = [.property(property)] }
                case .property(let property):
                    PropertyView(property: property)
                }
            }
        }.onReceive(pub) { (output) in
            print("Data has changed somewhere")
        }
    }
    
    private func deleteItems(offsets: IndexSet) {
        withAnimation {
            for index in offsets {
                
                let propertyToDelete = properties[index]
                
                do {
                    // Remove all the directories associated with this
                    //
                    for survey in propertyToDelete.surveys {
                        let directoryUrl = getDocumentsDirectory().appending(path: "Scans").appending(path: "\(survey.surveyId.uuidString)")
                        
                        if FileManager.default.fileExists(atPath: directoryUrl.path()) {
                            try FileManager.default.removeItem(at: directoryUrl)
                        }
                    }
                    
                    modelContext.delete(propertyToDelete)
                    
                    try modelContext.save()
                } catch {
                    print("Failed to delete survey \(error)")
                }
            }
        }
    }
    
    private func getDocumentsDirectory() -> URL {
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        let documentsDirectory = paths[0]
        return documentsDirectory
    }
}

/// Shown before anything has been scanned: what the app does, how a scan works, and a way in.
struct GettingStartedView: View {
    private let steps: [(icon: String, title: String, detail: String)] = [
        ("house", "Add your home", "Give it a name. It stays on your phone and isn't uploaded."),
        ("camera.metering.matrix", "Scan room by room", "Walk slowly round each room, pointing the camera at the walls, windows and doors."),
        ("arrow.up.doc", "Complete and upload", "Your rooms are joined into a floorplan, which you can use with heatlossdb.org."),
    ]
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Find homes like yours")
                        .font(.title2.bold())
                    Text("Scan your home and HeatLossDB will match it with similar homes, so you can see what heat pumps they use and how well they work.")
                        .foregroundStyle(.secondary)
                }
                
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: 14) {
                            Image(systemName: step.icon)
                                .font(.title3)
                                .foregroundStyle(.tint)
                                .frame(width: 32)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(index + 1). \(step.title)")
                                    .font(.headline)
                                Text(step.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                
                if RoomCaptureSession.isSupported {
                    NavigationLink(value: Route.addProperty) {
                        Label("Scan Your Home", systemImage: "camera.metering.matrix")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Label("Scanning needs an iPhone or iPad with a LiDAR sensor, such as an iPhone Pro.", systemImage: "exclamationmark.triangle")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(24)
        }
    }
}

#Preview {
    MainActor.assumeIsolated {
        ContentView()
            .modelContainer(previewContainer)
            .environment(ScanRoomModel.shared)
    }
}
