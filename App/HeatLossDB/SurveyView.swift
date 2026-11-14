//
//  SurveyView.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 29/02/2024.
//

import SwiftUI
import SwiftData
import RoomPlan
import SceneKit
import _SpriteKit_SwiftUI

/// Presentation state for the survey section. It is owned by the parent view because alerts,
/// covers and navigation destinations must be attached to the Form, not to a Section inside it:
/// modifiers on a Section are applied to every one of its rows, so each row would try to present.
@Observable
final class SurveySectionState {
    var isShowingResetConfirmation = false
    var isScanning = false
    /// Tips shown before the first room is scanned.
    var isShowingScanTips = false
    /// Set when the tips are dismissed with "Start Scanning", so scanning starts once the sheet
    /// has gone (pushing the scanner while the sheet is still dismissing can be dropped).
    var startScanningAfterTips = false
    /// The room being renamed, and the name being typed for it.
    var renamingRoom: Room?
    var newRoomName = ""

    var floorPlanScene: FloorPlanScene?
    /// A room's 3D model being shown.
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
        property.rooms.sorted { $0.scannedAt < $1.scannedAt }
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
            Text("Scanned Rooms")
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
        Text(room.name)
            .foregroundStyle(.primary)
    }
    
    private func startScanning() {
        if rooms.isEmpty {
            state.isShowingScanTips = true
        } else {
            beginScanning(scanRoomModel: scanRoomModel, survey: survey, state: state)
        }
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
            uploadActions
            
            ShareLink(items: shareURLs) {
                Label("Share Scan", systemImage: "square.and.arrow.up")
            }
            .disabled(shareURLs.isEmpty)
        }
        
        resetAction
    }
    
    /// The upload's code, while it can still be used on the website.
    private var activeUploadCode: String? {
        guard let code = survey.uploadCode, let expiresAt = survey.uploadCodeExpiresAt, expiresAt > Date() else { return nil }
        return code
    }
    
    @ViewBuilder
    private var uploadActions: some View {
        if scanRoomModel.isUploading(survey.surveyId) {
            HStack {
                ProgressView()
                Text("Uploading…")
            }
        } else if let link = survey.uploadURL.flatMap(URL.init(string:)) {
            if let code = activeUploadCode {
                VStack(alignment: .leading, spacing: 4) {
                    Text(code)
                        .font(.system(.largeTitle, design: .monospaced, weight: .semibold))
                        .tracking(6)
                        .textSelection(.enabled)
                        .accessibilityLabel(code.map(String.init).joined(separator: " "))
                    Text("Enter this code on \(link.host() ?? "HeatLossDB") to open the scan. It expires \(survey.uploadCodeExpiresAt!.formatted(.relative(presentation: .named))).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            Link(destination: link) {
                Label("Open on HeatLossDB", systemImage: "safari")
            }
            ShareLink(item: link) {
                Label("Share Link", systemImage: "link")
            }
            Button(activeUploadCode == nil ? "Upload Again for a New Code" : "Upload Again", systemImage: "icloud.and.arrow.up", action: upload)
                .disabled(mergedStructure == nil)
        } else {
            Button("Upload to HeatLossDB", systemImage: "icloud.and.arrow.up", action: upload)
                .disabled(mergedStructure == nil)
        }
        
        if let uploadError = scanRoomModel.uploadError(for: survey.surveyId) {
            Text("Upload failed: \(uploadError)")
                .foregroundStyle(.red)
        }
    }
    
    private func upload() {
        Task {
            guard let upload = await scanRoomModel.upload(surveyId: survey.surveyId) else { return }
            survey.uploadId = upload.id
            survey.uploadURL = upload.url.absoluteString
            survey.uploadedAt = Date()
            survey.uploadCode = upload.code
            survey.uploadCodeExpiresAt = upload.codeExpiresAt
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
            Text("Scan each room in turn, tapping Finish Room when it's done and Start Scanning in the next. Keep the camera up as you move between rooms. You must scan at least two rooms to complete the survey.")
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
            .sheet(isPresented: $state.isShowingScanTips, onDismiss: {
                if state.startScanningAfterTips {
                    state.startScanningAfterTips = false
                    beginScanning(scanRoomModel: scanRoomModel, survey: survey, state: state)
                }
            }) {
                ScanTipsView(initialRoomCount: survey.plannedRoomCount ?? 6) { roomCount in
                    survey.plannedRoomCount = roomCount
                    try? modelContext.save()
                    state.startScanningAfterTips = true
                    state.isShowingScanTips = false
                }
            }
            .navigationDestination(isPresented: $state.isScanning) {
                ScanRoomView(property: property, survey: survey)
            }
            .fullScreenCover(isPresented: isPreviewing) {
                if let url = state.previewURL {
                    RoomModelView(url: url) { state.previewURL = nil }
                }
            }
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
    
    private var isPreviewing: Binding<Bool> {
        Binding(get: { state.previewURL != nil }, set: { if !$0 { state.previewURL = nil } })
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
        survey.uploadCode = nil
        survey.uploadCodeExpiresAt = nil
        survey.plannedRoomCount = nil
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

/// Opens the scanner. The first room sets up the capture session that every room in the survey
/// shares.
@MainActor
private func beginScanning(scanRoomModel: ScanRoomModel, survey: Survey, state: SurveySectionState) {
    if !scanRoomModel.isSurveying(survey.surveyId) {
        scanRoomModel.startSurvey(surveyId: survey.surveyId)
    }
    state.isScanning = true
}

/// Tips shown before the first room is scanned, and how many rooms there are to scan.
struct ScanTipsView: View {
    @Environment(\.dismiss) private var dismiss
    
    /// Starts scanning with the number of rooms the user expects to scan.
    var onStart: (Int) -> Void
    
    @State private var roomCount: Int
    
    init(initialRoomCount: Int, onStart: @escaping (Int) -> Void) {
        self.onStart = onStart
        _roomCount = State(initialValue: initialRoomCount)
    }
    
    var body: some View {
        NavigationStack {
            List {
                tip("Make it bright", "Turn the lights on and open the curtains and blinds, so the camera can see the walls and windows clearly.", systemImage: "sun.max")
                tip("Open the doors", "Open the internal doors before you start, so you can walk from room to room without stopping.", systemImage: "door.left.hand.open")
                tip("Go slowly", "Keep the camera up and move slowly round the edge of each room, taking in every wall, window and door.", systemImage: "figure.walk")
                tip("One room at a time", "When you've scanned the whole room, tap Finish Room. Walk to the next room with the camera up, then tap Start Scanning.", systemImage: "arrow.right.circle")
                tip("Don't worry about names", "Rooms are numbered as you go. You can rename them later, here or online.", systemImage: "pencil")
            }
            .navigationTitle("Before you scan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button { onStart(roomCount) } label: {
                    Text("Start Scanning")
                        .fontWeight(.bold)
                        .frame(maxWidth: .infinity)
                }
                .padding()
                .background(Color("AccentColor"))
                .foregroundColor(.white)
                .clipShape(Capsule())
                .padding()
            }
        }
    }
    
    private func tip(_ title: String, _ detail: String, systemImage: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).fontWeight(.semibold)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.tint)
        }
        .padding(.vertical, 4)
    }
}

/// A room's 3D model, to turn and zoom with a finger. Quick Look would also offer AR, which
/// isn't useful for a room you're standing in.
struct RoomModelView: View {
    var url: URL
    var onClose: () -> Void
    
    @State private var scene: SCNScene?
    @State private var failed = false
    
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color(.systemBackground).ignoresSafeArea()
            
            if let scene {
                SceneView(scene: scene, options: [.allowsCameraControl, .autoenablesDefaultLighting])
                    .ignoresSafeArea()
                    .accessibilityLabel("3D model of the room. Drag to turn it, pinch to zoom.")
            } else if failed {
                Text("The room's model couldn't be opened.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            
            Button("Close", action: onClose)
                .padding()
                .background(.thinMaterial)
                .clipShape(Capsule())
                .padding()
        }
        .task {
            do {
                scene = try SCNScene(url: url)
            } catch {
                print("Failed to open room model \(error)")
                failed = true
            }
        }
    }
}
