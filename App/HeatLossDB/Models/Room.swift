//
//  Room.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 09/03/2024.
//
import Foundation
import SwiftData

@Model
final class Room {
    /// Matches the <roomId>.json / <roomId>.usdz files saved in the survey's scan folder.
    var roomId: UUID
    var name: String
    var property: Property?
    var scannedAt: Date = Date()
    
    init(roomId: UUID = UUID(), name: String, property: Property) {
        self.roomId = roomId
        self.name = name
        self.property = property
        self.scannedAt = Date()
    }
}
