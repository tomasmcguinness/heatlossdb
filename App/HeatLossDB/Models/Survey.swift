//
//  Survey.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 01/03/2024.
//

import SwiftData
import Foundation

@Model
final class Survey {
   
    var surveyId:UUID
    var date: Date
    var property: Property?
    var isComplete: Bool
    
    /// Set once the merged scan has been uploaded to heatlossdb. The URL is a private link to
    /// the survey on the website; anyone with it can view the scan.
    var uploadId: String?
    var uploadURL: String?
    var uploadedAt: Date?
    /// A short code for opening the upload on the website, until it expires a day later.
    var uploadCode: String?
    var uploadCodeExpiresAt: Date?
    
    /// How many rooms the user expects to scan, asked before the first. Only for showing
    /// progress ("Room 3 of 7"); more or fewer can be scanned.
    var plannedRoomCount: Int?
    
    init(date: Date, property: Property) {
        self.surveyId = UUID()
        self.date = date
        self.property = property
        self.isComplete = false
    }
}
