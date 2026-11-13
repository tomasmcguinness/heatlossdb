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

/// The camera view for the whole survey: one walk round the home, a room at a time. "Finish room"
/// ends the room being captured; the user then moves to the next room and taps "Start scanning".
/// Tracking runs throughout, so the rooms line up. "Finish home" completes the survey. Rooms are named "Room 1", "Room 2"…
/// and can be renamed from the survey; StructureBuilder works out which storey each is on.
struct ScanRoomView : View {
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Environment(ScanRoomModel.self) private var scanRoomModel
    
    var property: Property
    var survey: Survey
    
    @State private var isConfirmingFinish = false
    
    private var capturingRoom: WalkRoom? {
        scanRoomModel.capturingRoom
    }
    
    /// Rooms already recorded, plus the one being captured.
    private var roomCount: Int {
        property.rooms.count + (capturingRoom == nil ? 0 : 1)
    }
    
    var body: some View {
        ZStack {
            if capturingRoom == nil, let session = scanRoomModel.arSession {
                // Between rooms: the room's capture view has stopped, but the camera hasn't.
                CameraFeedRepresentable(session: session)
                    .ignoresSafeArea()
            } else if let roomCaptureView = scanRoomModel.roomCaptureView {
                ScanRoomRepresentable(roomCaptureView: roomCaptureView)
                    // Each room gets a new capture view; this makes SwiftUI swap it in.
                    .id(ObjectIdentifier(roomCaptureView))
                    .ignoresSafeArea()
            } else {
                Text("The scanning session isn't running")
            }
            
            VStack(spacing: 12) {
                topBar
                Spacer()
                if let reason = scanRoomModel.stoppedReason {
                    stoppedBanner(reason)
                } else if let failed = failedRoom {
                    failureBanner(failed)
                }
                controls
            }
            .padding()
        }
        .navigationBarBackButtonHidden(true)
        .onAppear(perform: start)
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .confirmationDialog("Finish the survey?", isPresented: $isConfirmingFinish, titleVisibility: .visible) {
            Button("Finish Home", action: finishHome)
        } message: {
            Text("Your \(roomCount) rooms will be merged into one floor plan. To add rooms after this, you'll need to reset the survey.")
        }
    }
    
    // MARK: - Overlay
    
    private var topBar: some View {
        HStack(alignment: .top) {
            Button("Close", action: close)
                .padding()
                .background(.thinMaterial)
                .clipShape(Capsule())
                .accessibilityHint("Stops scanning. Rooms you've finished are kept; the room in progress isn't.")
            
            Spacer()
            
            VStack(spacing: 2) {
                Text(capturingRoom == nil ? "Between rooms" : "Room \(roomCount)")
                    .fontWeight(.bold)
                Text(progressText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.thinMaterial)
            .clipShape(Capsule())
            
            Spacer()
            
            WalkSketch(rooms: scanRoomModel.walk)
        }
    }
    
    private var progressText: String {
        let saving = scanRoomModel.walk.filter { $0.status == .processing }.count
        let done = property.rooms.count
        let rooms = done == 1 ? "1 room done" : "\(done) rooms done"
        return saving > 0 ? "\(rooms) · saving \(saving)" : rooms
    }
    
    /// While a room is being scanned: Finish room. Between rooms: a prompt to move to the next
    /// room and Start scanning, so the walk there isn't captured as part of either room.
    private var controls: some View {
        VStack(spacing: 10) {
            if capturingRoom == nil {
                Text(property.rooms.isEmpty
                     ? "Stand in the first room, then tap Start scanning."
                     : "\(scanRoomModel.lastFinishedRoom?.name ?? "Room") saved. Move to the next room, then tap Start scanning.")
                    .multilineTextAlignment(.center)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            if scanRoomModel.lastFinishedRoom != nil {
                redoButton
                    .disabled(scanRoomModel.isEndingRoom)
            }
            HStack(spacing: 10) {
                if capturingRoom == nil {
                    primaryButton("Start scanning", systemImage: "camera.metering.matrix", action: startScanning)
                        .disabled(scanRoomModel.isEndingRoom)
                        .accessibilityHint("Starts scanning the room you're in")
                } else {
                    primaryButton("Finish room", systemImage: "checkmark", action: finishRoom)
                        .disabled(scanRoomModel.isEndingRoom)
                        .accessibilityHint("Saves this room. Scan every wall, window and door first.")
                }
                
                secondaryButton("Finish home") { isConfirmingFinish = true }
                    .disabled(roomCount < 2 || scanRoomModel.isEndingRoom)
            }
        }
    }
    
    private func primaryButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .fontWeight(.bold)
                .frame(maxWidth: .infinity)
        }
        .padding()
        .background(Color("AccentColor"))
        .foregroundColor(.white)
        .clipShape(Capsule())
    }
    
    private var redoButton: some View {
        Button {
            redoLastRoom()
        } label: {
            Label("Redo \(scanRoomModel.lastFinishedRoom?.name ?? "last room")", systemImage: "arrow.uturn.backward")
                .font(.subheadline)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.thinMaterial)
        .clipShape(Capsule())
        .accessibilityHint("Throws away the last room and scans it again")
    }
    
    private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.subheadline)
            .fontWeight(.semibold)
            .padding(.vertical)
            .padding(.horizontal, 12)
            .background(.thinMaterial)
            .clipShape(Capsule())
    }
    
    private var failedRoom: WalkRoom? {
        scanRoomModel.walk.last { room in
            if case .failed = room.status { return true }
            return false
        }
    }
    
    private func failureBanner(_ room: WalkRoom) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text("\(room.name) couldn't be saved.")
                .font(.subheadline)
            Spacer()
            if room.id == scanRoomModel.lastFinishedRoom?.id {
                Button("Redo", action: redoLastRoom)
                    .fontWeight(.semibold)
            }
        }
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
    
    /// RoomPlan stopped capturing this room by itself; Finish room saves what it got.
    private func stoppedBanner(_ reason: String) -> some View {
        HStack(alignment: .top) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            VStack(alignment: .leading, spacing: 2) {
                Text("Scanning stopped: \(reason)")
                    .font(.subheadline)
                Text("Tap Finish room to save what was captured.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Actions
    
    private func start() {
        UIApplication.shared.isIdleTimerDisabled = true
        guard capturingRoom == nil else { return }
        scanRoomModel.startRoom()
    }
    
    /// Ends the room being captured and records it. Tracking keeps running while the user moves
    /// to the next room, so rooms still line up when merged.
    private func finishRoom() {
        let name = uniqueName("Room \(property.rooms.count + 1)")
        guard let room = scanRoomModel.endRoom(name: name, startNext: false) else { return }
        
        modelContext.insert(Room(roomId: room.id, name: room.name, property: property))
        do {
            try modelContext.save()
        } catch {
            print("Failed to save room \(error)")
        }
    }
    
    private func startScanning() {
        scanRoomModel.startRoom()
    }
    
    private func finishHome() {
        if capturingRoom != nil {
            finishRoom()
        }
        survey.isComplete = true
        try? modelContext.save()
        
        let surveyId = survey.surveyId
        Task { await scanRoomModel.completeSurvey(surveyId: surveyId) }
        dismiss()
    }
    
    private func redoLastRoom() {
        guard let removed = scanRoomModel.redoLastRoom() else { return }
        if let room = property.rooms.first(where: { $0.roomId == removed.id }) {
            modelContext.delete(room)
            try? modelContext.save()
        }
    }
    
    private func close() {
        // Rooms already finished are kept; only the one in progress is thrown away.
        scanRoomModel.cancelRoom()
        dismiss()
    }
    
    // MARK: - Names
    
    /// "Bedroom", then "Bedroom 2", "Bedroom 3"… if the name is already used in this property.
    private func uniqueName(_ name: String) -> String {
        let taken = Set(property.rooms.map(\.name))
        guard taken.contains(name) else { return name }
        var number = 2
        while taken.contains("\(name) \(number)") {
            number += 1
        }
        return "\(name) \(number)"
    }
}

/// The rooms captured so far, seen from above. Every room
/// shares the session's coordinates, so they appear where they are relative to each other.
private struct WalkSketch: View {
    var rooms: [WalkRoom]
    
    var body: some View {
        let points = rooms.flatMap { room in room.walls.flatMap { [$0.a, $0.b] } }
        if !points.isEmpty {
            Canvas { context, size in
                let minX = points.map(\.x).min()!
                let minY = points.map(\.y).min()!
                let width = max(points.map(\.x).max()! - minX, 1)
                let height = max(points.map(\.y).max()! - minY, 1)
                let inset: CGFloat = 8
                let scale = min((size.width - 2 * inset) / width, (size.height - 2 * inset) / height)
                let originX = (size.width - width * scale) / 2
                let originY = (size.height - height * scale) / 2
                let place = { (p: CGPoint) in CGPoint(x: originX + (p.x - minX) * scale, y: originY + (p.y - minY) * scale) }
                
                for room in rooms where !room.walls.isEmpty {
                    var path = Path()
                    for wall in room.walls {
                        path.move(to: place(wall.a))
                        path.addLine(to: place(wall.b))
                    }
                    context.stroke(path, with: .color(.white), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                }
            }
            .frame(width: 96, height: 96)
            .background(.black.opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityElement()
            .accessibilityLabel("Sketch of the rooms scanned so far")
        }
    }
}
