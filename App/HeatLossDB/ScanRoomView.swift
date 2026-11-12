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

/// The camera view for the whole survey: one walk round the home, a room at a time. Each room is
/// two steps: "Room done" saves the room being captured, then, once it's saved and the user has
/// walked through to the next room with the camera up, "Scan next room" starts it. "Finish home"
/// completes the survey. Rooms are named "Room 1", "Room 2"… and can be renamed from the survey;
/// StructureBuilder works out which storey each is on.
struct ScanRoomView : View {

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Environment(ScanRoomModel.self) private var scanRoomModel

    var property: Property
    var survey: Survey

    @State private var isConfirmingFinish = false
    
    /// A survey needs this many rooms before it can be finished (as on the survey screen).
    static let minimumRooms = 2

    /// Where the walk is: capturing a room, waiting for RoomPlan to hand one over, or between rooms.
    private enum Phase {
        case capturing
        case saving
        case betweenRooms
    }

    private var phase: Phase {
        if scanRoomModel.isEndingRoom { return .saving }
        return capturingRoom == nil ? .betweenRooms : .capturing
    }

    private var capturingRoom: WalkRoom? {
        scanRoomModel.capturingRoom
    }

    /// Rooms already recorded.
    private var doneCount: Int {
        property.rooms.count
    }

    /// Rooms already recorded, plus the one being captured.
    private var roomCount: Int {
        doneCount + (capturingRoom == nil ? 0 : 1)
    }

    private var plannedCount: Int? {
        survey.plannedRoomCount
    }

    /// Every planned room has been scanned (and enough to finish), so finishing is next.
    private var isPlanDone: Bool {
        if let plannedCount { return doneCount >= max(plannedCount, Self.minimumRooms) }
        return false
    }

    var body: some View {
        ZStack {
            if let roomCaptureView = scanRoomModel.roomCaptureView {
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
                if let reason = scanRoomModel.stoppedReason, phase == .capturing {
                    stoppedBanner(reason)
                } else if let failed = failedRoom, phase == .betweenRooms {
                    failureBanner(failed)
                } else if phase == .betweenRooms {
                    betweenRoomsBanner
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
            Text("Your \(roomCount) \(roomCount == 1 ? "room" : "rooms") will be merged into one floor plan. To add rooms after this, you'll need to reset the survey.")
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

            plannedRoomsMenu

            Spacer()

            WalkSketch(rooms: scanRoomModel.walk)
        }
    }

    /// "Room 3 of 7" and how many are done. Tapping it changes how many rooms are planned, for
    /// when one was missed or counted twice.
    private var plannedRoomsMenu: some View {
        Menu {
            Button("Add a room to the plan", systemImage: "plus") {
                setPlannedCount(max(plannedCount ?? roomCount, roomCount) + 1)
            }
            if let plannedCount, plannedCount > max(roomCount, Self.minimumRooms) {
                Button("Remove a room from the plan", systemImage: "minus") {
                    setPlannedCount(plannedCount - 1)
                }
            }
        } label: {
            VStack(spacing: 2) {
                Text(titleText)
                    .fontWeight(.bold)
                Text(progressText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.thinMaterial)
            .clipShape(Capsule())
        }
        .foregroundStyle(.primary)
        .accessibilityHint("Changes how many rooms you plan to scan")
    }

    private var ofPlanned: String {
        plannedCount.map { " of \($0)" } ?? ""
    }

    private var titleText: String {
        switch phase {
        case .capturing: return "Room \(roomCount)\(ofPlanned)"
        case .saving: return "Saving room \(doneCount)"
        case .betweenRooms: return isPlanDone ? "All rooms scanned" : "Next: room \(doneCount + 1)\(ofPlanned)"
        }
    }

    private var progressText: String {
        let saving = scanRoomModel.walk.filter { $0.status == .processing }.count
        let rooms = doneCount == 1 ? "1 room done" : "\(doneCount) rooms done"
        return saving > 0 ? "\(rooms) · saving \(saving)" : rooms
    }

    @ViewBuilder
    private var controls: some View {
        VStack(spacing: 10) {
            if phase == .betweenRooms, scanRoomModel.lastFinishedRoom != nil {
                redoButton
            }
            HStack(spacing: 10) {
                switch phase {
                case .capturing:
                    primaryButton("Room done", systemImage: "checkmark") { roomDone() }
                        .accessibilityHint("Saves this room. You'll start the next one when you're ready.")
                    secondaryButton("Finish home") { isConfirmingFinish = true }
                        .disabled(roomCount < Self.minimumRooms)
                case .saving:
                    savingIndicator
                case .betweenRooms where isPlanDone:
                    primaryButton("Finish home", systemImage: "house") { isConfirmingFinish = true }
                    secondaryButton("Scan another room", action: scanNextRoom)
                case .betweenRooms:
                    primaryButton("Scan next room", systemImage: "arrow.right", action: scanNextRoom)
                        .accessibilityHint("Starts scanning the room you're in. Walk through the doorway with the camera up first.")
                    secondaryButton("Finish home") { isConfirmingFinish = true }
                        .disabled(doneCount < Self.minimumRooms)
                }
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

    private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.subheadline)
            .fontWeight(.semibold)
            .padding(.vertical)
            .padding(.horizontal, 12)
            .background(.thinMaterial)
            .clipShape(Capsule())
    }

    /// Shown while RoomPlan hands the room over, usually a second or two. Nothing can be tapped,
    /// so a room can't be ended twice or the next started too soon.
    private var savingIndicator: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Saving room…")
                .fontWeight(.semibold)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.thinMaterial)
        .clipShape(Capsule())
        .accessibilityElement(children: .combine)
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

    /// What to do between rooms.
    private var betweenRoomsBanner: some View {
        HStack(alignment: .top) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 2) {
                if let last = scanRoomModel.lastFinishedRoom {
                    Text("\(last.name) done.")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }
                Text(isPlanDone
                     ? "That's every room you planned. Finish the home, or scan another room if you missed one."
                     : "Keep the camera up and walk into the next room, then tap Scan next room.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    /// RoomPlan stopped capturing this room by itself; Room done saves what it got.
    private func stoppedBanner(_ reason: String) -> some View {
        HStack(alignment: .top) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            VStack(alignment: .leading, spacing: 2) {
                Text("Scanning stopped: \(reason)")
                    .font(.subheadline)
                Text("Tap Room done to save what was captured.")
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
        // Opening the scanner starts a room, unless one is already running or being saved.
        guard phase == .betweenRooms, !isPlanDone else { return }
        scanRoomModel.startRoom()
    }

    /// Ends the room being captured and records it. Returns false if there wasn't one to end.
    @discardableResult
    private func roomDone() -> Bool {
        let name = uniqueName("Room \(property.rooms.count + 1)")
        guard let room = scanRoomModel.endRoom(name: name) else { return false }

        modelContext.insert(Room(roomId: room.id, name: room.name, property: property))
        do {
            try modelContext.save()
        } catch {
            print("Failed to save room \(error)")
        }
        return true
    }

    private func scanNextRoom() {
        // Scanning past the plan means the plan was short.
        if let plannedCount, doneCount >= plannedCount {
            setPlannedCount(doneCount + 1)
        }
        scanRoomModel.startRoom()
    }

    private func finishHome() {
        if phase == .capturing {
            roomDone()
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

    private func setPlannedCount(_ count: Int) {
        survey.plannedRoomCount = count
        try? modelContext.save()
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
