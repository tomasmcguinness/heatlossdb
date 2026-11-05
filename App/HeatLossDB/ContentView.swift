//
//  ContentView.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 16/06/2023.
//

import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var properties: [Property]
    
    let pub = NotificationCenter.default.publisher(for: NSNotification.Name.NSManagedObjectContextObjectsDidChange)
    
    var body: some View {
        NavigationStack {
            List {
                ForEach(properties) { item in
                    NavigationLink(destination: PropertyView(property: item)) {
                        Text(item.name)
                    }
                }
                .onDelete(perform: deleteItems)
            }
            .navigationTitle("Properties")
            .toolbar {
                ToolbarItem {
                    NavigationLink(destination: AddPropertyView()) {
                        Image(systemName: "plus")
                    }
                }
            }
            Text("Select or add a property")
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

#Preview {
    MainActor.assumeIsolated {
        ContentView()
            .modelContainer(previewContainer)
            .environment(ScanRoomModel.shared)
    }
}
