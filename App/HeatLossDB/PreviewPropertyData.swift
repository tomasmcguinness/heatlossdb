//
//  PreviewPropertyData.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 19/06/2023.
//

import SwiftUI
import SwiftData

@MainActor
let previewContainer: ModelContainer = {
    do {
        let container = try ModelContainer(for: Property.self)
        
        for property in SampleProperties.contents {
            container.mainContext.insert(property)
        }
        
        return container
    } catch {
        fatalError("Failed to create sample container")
    }
}()

