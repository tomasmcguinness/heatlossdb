//
//  ScanRoomView.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 09/03/2024.
//

import Foundation
import SwiftUI
import SwiftData
import RoomPlan

struct ScanRoomView : View {
    
    private enum Phase {
        case scanning
        case processing
        case saved
        case failed(String)
    }
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Environment(ScanRoomModel.self) private var scanRoomModel
    
    @State private var roomId = UUID()
    @State private var isCapturing = false
    
    var roomName: String
    var property: Property
    var survey: Survey
    
    private var phase: Phase {
        if isCapturing { return .scanning }
        if scanRoomModel.savedRoomIds.contains(roomId) { return .saved }
        if let error = scanRoomModel.scanError(for: roomId) { return .failed(error) }
        return .processing
    }
    
    var body: some View {
        ZStack {
            if let roomCaptureView = scanRoomModel.roomCaptureView {
                ScanRoomRepresentable(roomCaptureView: roomCaptureView).ignoresSafeArea()
            } else {
                Text("The scanning session isn't running")
            }
            
            VStack {
                HStack {
                    Button("Cancel", action: cancel)
                        .padding()
                        .background(.thinMaterial)
                        .clipShape(Capsule())
                    Spacer()
                    Text(roomName)
                        .fontWeight(.bold)
                        .padding()
                        .background(.thinMaterial)
                        .clipShape(Capsule())
                }
                .padding()
                
                Spacer()
                
                actionButton
                    .padding()
                    .background(Color("AccentColor"))
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                    .fontWeight(.bold)
                    .padding(.bottom)
            }
        }
        .navigationBarBackButtonHidden(true)
        .onAppear(perform: startCapture)
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
    
    @ViewBuilder
    private var actionButton: some View {
        switch phase {
        case .scanning:
            Button("Done", action: stopCapture)
        case .processing:
            HStack {
                ProgressView().tint(.white)
                Text("Processing…")
            }
        case .saved:
            Button("Save Room", action: saveRoom)
        case .failed(let message):
            Button("Scan failed: \(message). Try again", action: startCapture)
        }
    }
    
    private func startCapture() {
        guard scanRoomModel.roomCaptureView != nil else { return }
        
        isCapturing = true
        scanRoomModel.startCapture(roomId: roomId)
        
        UIApplication.shared.isIdleTimerDisabled = true
    }
    
    private func stopCapture() {
        isCapturing = false
        scanRoomModel.pauseCapture()
        
        UIApplication.shared.isIdleTimerDisabled = false
    }
    
    private func saveRoom() {
        let room = Room(roomId: roomId, name: roomName, property: property)
        modelContext.insert(room)
        
        do {
            try modelContext.save()
        } catch {
            print("Failed to save room \(error)")
        }
        
        dismiss()
    }
    
    private func cancel() {
        if isCapturing {
            scanRoomModel.pauseCapture()
        }
        // Discard anything already written for this room so it isn't merged.
        scanRoomModel.deleteRoomFiles(surveyId: survey.surveyId, roomId: roomId)
        dismiss()
    }
}
