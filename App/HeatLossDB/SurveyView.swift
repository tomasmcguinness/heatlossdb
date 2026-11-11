//
//  SurveyView.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 29/02/2024.
//

import SwiftUI
import SwiftData
import RoomPlan
import QuickLook
import _SpriteKit_SwiftUI

/// Presentation state for the survey section. It is owned by the parent view because alerts,
/// covers and navigation destinations must be attached to the Form, not to a Section inside it:
/// modifiers on a Section are applied to every one of its rows, so each row would try to present.
@Observable
final class SurveySectionState {
    var isShowingResetConfirmation = false
    var isScanning = false
    /// The room being renamed, and the name being typed for it.
    var renamingRoom: Room?
    var newRoomName = ""

    var floorPlanScene: FloorPlanScene?
    /// A room's 3D model being shown in Quick Look.
    var previewURL: URL?
}

extension FloorPlanScene: Identifiable {}

/// The property's single survey: walk round the home scanning room by room, then complete the
/// survey to merge them.
struct SurveySection : View {
    @Environment(\.modelContext) private var modelContext
    @Environment(ScanRoomModel.self) private var scanRoomModel
    
    var property: Property
    var survey: Survey
    var state: SurveySectionState
    
    private var rooms: [Room] {
        property.rooms.sorted { ($0.floor, $0.scannedAt) < ($1.floor, $1.scannedAt) }
    }
    
    /// Floors are only worth labelling once there's more than one.
    private var hasSeveralFloors: Bool {
        Set(property.rooms.map(\.floor)).count > 1
    }

    private var isSurveying: Bool {
        scanRoomModel.isSurveying(survey.surveyId)
    }
    
    private var isAnotherSurveyActive: Bool {
        scanRoomModel.isSurveyActive && !isSurveying
    }
    
    private var isMerging: Bool {
        scanRoomModel.isMerging(survey.surveyId)
    }
    
    private var mergedStructure: CapturedStructure? {
        scanRoomModel.mergedStructure(for: survey.surveyId)
    }
    
    // MARK: - View Body
    var body: some View {
        Section {
            if rooms.isEmpty {
                Text("No rooms scanned yet")
                    .foregroundStyle(.secondary)
            }
            
            ForEach(rooms) { room in
                roomRow(room)
            }
            .onDelete(perform: survey.isComplete ? nil : deleteRooms)
            
            if !survey.isComplete {
                Button(rooms.isEmpty ? "Start Scanning" : "Continue Scanning", systemImage: "camera.metering.matrix", action: startScanning)
                    .disabled(isAnotherSurveyActive)
            }
        } header: {
            Text("Survey")
        } footer: {
            footer
        }

        if hasActions {
            Section {
                if survey.isComplete {
                    completedActions
                } else {
                    scanningActions
                }
            } header: {
                Text("Actions")
            }
        }
    }
    
    /// A saved room opens its 3D model; one still processing (or that failed to save) is plain text.
    /// Touch and hold to rename it.
    @ViewBuilder
    private func roomRow(_ room: Room) -> some View {
        Group {
            if let url = scanRoomModel.roomModelURL(surveyId: survey.surveyId, roomId: room.roomId) {
                Button {
                    state.previewURL = url
                } label: {
                    LabeledContent {
                        Image(systemName: "cube")
                            .foregroundStyle(.tint)
                    } label: {
                        roomLabel(room)
                    }
                }
                .accessibilityHint("Opens the room's 3D model")
            } else {
                roomLabel(room)
            }
        }
        .contextMenu {
            Button("Rename", systemImage: "pencil") {
                state.newRoomName = room.name
                state.renamingRoom = room
            }
        }
    }
    
    private func roomLabel(_ room: Room) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(room.name)
                .foregroundStyle(.primary)
            if hasSeveralFloors {
                Text("Floor \(room.floor + 1)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
    
    private func startScanning() {
        // The first room sets up the capture session that every room in the survey shares.
        if !scanRoomModel.isSurveying(survey.surveyId) {
            scanRoomModel.startSurvey(surveyId: survey.surveyId)
        }
        state.isScanning = true
    }
    
    /// Before the first room is scanned there is nothing to complete or reset, so the
    /// Actions section is hidden.
    private var hasActions: Bool {
        survey.isComplete || !rooms.isEmpty || isSurveying
    }
    
    // MARK: - Actions
    
    @ViewBuilder
    private var scanningActions: some View {
        if rooms.count >= 2 {
            Button("Complete Survey", systemImage: "checkmark.circle", action: completeSurvey)
        }
        
        resetAction
    }
    
    private var resetAction: some View {
        Button("Reset Survey", systemImage: "arrow.counterclockwise", role: .destructive) {
            state.isShowingResetConfirmation = true
        }
        .disabled(isMerging)
    }
    
    @ViewBuilder
    private var completedActions: some View {
        if isMerging {
            HStack {
                ProgressView()
                Text("Merging rooms…")
            }
        } else if let mergeError = scanRoomModel.mergeError(for: survey.surveyId) {
            Text("Merge failed: \(mergeError)")
                .foregroundStyle(.red)
            Button("Retry Merge", systemImage: "arrow.clockwise") {
                Task { await scanRoomModel.mergeRooms(surveyId: survey.surveyId) }
            }
        } else {
            let shareURLs = mergedStructure == nil ? [] : scanRoomModel.mergedFileURLs(surveyId: survey.surveyId)
            ShareLink(items: shareURLs) {
                Label("Share Scan", systemImage: "square.and.arrow.up")
            }
            .disabled(shareURLs.isEmpty)
        }
        
        resetAction
    }
    
    private func upload() {
        Task {
            guard let upload = await scanRoomModel.upload(surveyId: survey.surveyId) else { return }
            survey.uploadId = upload.id
            survey.uploadURL = upload.url.absoluteString
            survey.uploadedAt = Date()
            try? modelContext.save()
        }
    }
    
    @ViewBuilder
    private var footer: some View {
        if isAnotherSurveyActive {
            Text("Another property's survey is in progress. Complete it before scanning here.")
        } else if !survey.isComplete && !rooms.isEmpty && !isSurveying {
            Text("The scanning session was interrupted. Rooms scanned now won't line up with the earlier ones. Complete the survey with the rooms you have, or reset it.")
        } else if !survey.isComplete && rooms.count < 2 {
            Text("Walk round the home with the camera up, tapping Next Room at each doorway. You must scan at least two rooms to complete the survey.")
        }
    }
    
    private func completeSurvey() {
        survey.isComplete = true
        try? modelContext.save()
        
        // Waits for any room still being saved, then merges.
        let surveyId = survey.surveyId
        Task { await scanRoomModel.completeSurvey(surveyId: surveyId) }
    }
    
    private func deleteRooms(offsets: IndexSet) {
        let toDelete = offsets.map { rooms[$0] }
        withAnimation {
            for room in toDelete {
                scanRoomModel.deleteRoomFiles(surveyId: survey.surveyId, roomId: room.roomId)
                modelContext.delete(room)
            }
            do {
                try modelContext.save()
            } catch {
                print("Failed to delete room \(error)")
            }
        }
    }
}

/// The survey section's alerts, floorplan cover and scanner navigation, applied at the Form level.
struct SurveyPresentations: ViewModifier {
    @Environment(\.modelContext) private var modelContext
    @Environment(ScanRoomModel.self) private var scanRoomModel
    
    var property: Property
    var survey: Survey
    @Bindable var state: SurveySectionState
    
    func body(content: Content) -> some View {
        content
            .alert("Rename Room", isPresented: isRenaming) {
                TextField("Room name", text: $state.newRoomName)
                Button("Cancel", role: .cancel) { }
                Button("Rename", action: renameRoom)
                    .disabled(state.newRoomName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .confirmationDialog("Reset the survey?", isPresented: $state.isShowingResetConfirmation, titleVisibility: .visible) {
                Button("Reset Survey", role: .destructive, action: resetSurvey)
            } message: {
                Text("All survey data will be lost, including every scanned room and the merged floorplan. This can't be undone.")
            }
            .navigationDestination(isPresented: $state.isScanning) {
                ScanRoomView(property: property, survey: survey)
            }
            .quickLookPreview($state.previewURL)
            .fullScreenCover(item: $state.floorPlanScene) { scene in
                ZStack(alignment: .topTrailing) {
                    SpriteView(scene: scene)
                        .ignoresSafeArea()
                    Button("Close") { state.floorPlanScene = nil }
                        .padding()
                        .background(.thinMaterial)
                        .clipShape(Capsule())
                        .padding()
                }
            }
            .onAppear {
                if survey.isComplete
                    && scanRoomModel.mergedStructure(for: survey.surveyId) == nil
                    && !scanRoomModel.isMerging(survey.surveyId) {
                    Task { await scanRoomModel.mergeRooms(surveyId: survey.surveyId) }
                }
            }
    }
    
    private var isRenaming: Binding<Bool> {
        Binding(get: { state.renamingRoom != nil }, set: { if !$0 { state.renamingRoom = nil } })
    }
    
    private func renameRoom() {
        let name = state.newRoomName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let room = state.renamingRoom, !name.isEmpty else { return }
        room.name = name
        do {
            try modelContext.save()
        } catch {
            print("Failed to rename room \(error)")
        }
        state.renamingRoom = nil
    }
    
    /// Discards everything scanned for this survey so the property can be surveyed from scratch.
    private func resetSurvey() {
        if scanRoomModel.isSurveying(survey.surveyId) {
            scanRoomModel.stopSurvey()
        }
        scanRoomModel.deleteSurveyFiles(surveyId: survey.surveyId)
        survey.isComplete = false
        // The upload was of the old scan; forget its link.
        survey.uploadId = nil
        survey.uploadURL = nil
        survey.uploadedAt = nil
        for room in property.rooms {
            modelContext.delete(room)
        }
        do {
            try modelContext.save()
        } catch {
            print("Failed to reset survey \(error)")
        }
    }
}
