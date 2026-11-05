//
//  PropertyView.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 16/06/2023.
//

import SwiftUI
import SwiftData

struct PropertyView: View {
    
    @Environment(\.modelContext) private var modelContext
    
    @Bindable var property: Property
    
    @State private var surveyState = SurveySectionState()
    
    var body: some View {
        let form = Form {
            Section("Details") {
                LabeledContent("Name") {
                    TextField("Name", text: $property.name)
                        .multilineTextAlignment(.trailing)
                }
            }
            
            if let survey = property.survey {
                SurveySection(property: property, survey: survey, state: surveyState)
            }
        }
        .navigationTitle(property.name)
        .onAppear(perform: ensureSurvey)
        
        if let survey = property.survey {
            form.modifier(SurveyPresentations(property: property, survey: survey, state: surveyState))
        } else {
            form
        }
    }

    /// Properties created before the single-survey flow may not have a survey yet.
    private func ensureSurvey() {
        guard property.survey == nil else { return }
        
        let survey = Survey(date: Date(), property: property)
        modelContext.insert(survey)
        
        do {
            try modelContext.save()
        } catch {
            print("Failed to create survey \(error)")
        }
    }
}
