//
//  Property.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 29/02/2024.
//

import Foundation
import SwiftData

@Model
final class Property {
    var name: String
    
    init(name: String) {
        self.name = name
    }
    
    @Relationship(deleteRule: .cascade, inverse: \Survey.property)
    var surveys: [Survey] = []
    
    @Relationship(deleteRule: .cascade, inverse: \Room.property)
    var rooms: [Room] = []
    
    /// A property has a single survey; older data may have several, so use the most recent.
    var survey: Survey? {
        surveys.max { $0.date < $1.date }
    }
}
