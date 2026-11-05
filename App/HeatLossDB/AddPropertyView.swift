//
//  AddPropertyView.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 16/06/2023.
//

import SwiftUI
import SwiftData

struct AddPropertyView: View {
    
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    
    @State private var name: String = ""
    
    @FocusState private var isFocused: Bool
    
    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    var body: some View {
        Form {
            Section("Details") {
                TextField("Name", text: $name)
                    .focused($isFocused)
            }
        }
        .navigationTitle("Add Property")
        .toolbar {
            Button("Save", action: addItem)
                .disabled(trimmedName.isEmpty)
        }
        .onAppear { isFocused = true }
    }
    
    private func addItem() {
        withAnimation {
            let property = Property(name: trimmedName)
            modelContext.insert(property)
            
            let survey = Survey(date: Date(), property: property)
            modelContext.insert(survey)
            
            do {
                try modelContext.save()
            } catch {
                print("Failed to save property \(error)")
            }
            dismiss()
        }
    }
}

#Preview {
    MainActor.assumeIsolated {
        NavigationStack {
            AddPropertyView().modelContainer(previewContainer)
        }
    }
}
