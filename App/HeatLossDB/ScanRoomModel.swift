//
//  ScanRoomModel.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 09/03/2024.
//

import CoreGraphics
import Foundation
import Observation
import ARKit
import RoomPlan

/// A room captured on the current walk round the home.
struct WalkRoom: Identifiable {
    enum Status: Equatable {
        case capturing
        case processing
        case saved
        case failed(String)
    }
    
    let id: UUID
    var name: String
    var status: Status
    /// The room's walls seen from above (x, z in metres), once it's processed.
    var walls: [WallLine] = []
}

struct WallLine {
    let a: CGPoint
    let b: CGPoint
}

/// Owns the single RoomCaptureSession shared by every room in a survey, along with the
/// survey-in-progress and merge state, so that state outlives any one view.
@Observable
class ScanRoomModel : RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
    
    static let shared = ScanRoomModel()
    
    private(set) var roomCaptureView: RoomCaptureView?
    
    /// The survey whose capture session is currently running, if any.
    private(set) var activeSurveyId: UUID?
    
    /// The survey currently being merged, if any.
    private(set) var mergingSurveyId: UUID?
    
    private var mergeError: (surveyId: UUID, message: String)?
    
    private(set) var finalStructure: CapturedStructure?
    private(set) var finalStructureSurveyId: UUID?
    
    /// Rooms whose scan has been processed and written to disk during this app session.
    private(set) var savedRoomIds: Set<UUID> = []
    
    /// The most recent error processing or saving a room scan, keyed by room.
    private(set) var scanError: (roomId: UUID, message: String)?
    
    /// The survey currently being uploaded to heatlossdb, if any.
    private(set) var uploadingSurveyId: UUID?
    
    private var uploadError: (surveyId: UUID, message: String)?
    
    @ObservationIgnored
    private let captureSessionConfig: RoomCaptureSession.Configuration
    
    @ObservationIgnored
    private var structureBuilder: StructureBuilder = StructureBuilder(options: [.beautifyObjects])
    
    @ObservationIgnored
    private var roomCaptureSession: RoomCaptureSession?
    
    /// Whether `roomCaptureView` has captured a room. Once it has, it won't show the camera feed
    /// again, so the next room gets a fresh view on the same AR session.
    @ObservationIgnored
    private var captureViewUsed = false
    
    /// Views from earlier rooms. They're kept until the survey ends because they share the AR
    /// session, and releasing one could stop tracking for the rest of the walk.
    @ObservationIgnored
    private var retiredCaptureViews: [RoomCaptureView] = []
    
    @ObservationIgnored
    private let roomBuilder = RoomBuilder(options: [.beautifyObjects])
    
    /// Every room captured since the survey's session started, in order. The camera view shows
    /// them as progress and a sketch.
    private(set) var walk: [WalkRoom] = []
    
    /// The room being captured, if any.
    private(set) var capturingRoomId: UUID?
    
    /// True from asking a room to end until RoomPlan hands over its data.
    private(set) var isEndingRoom = false
    
    // The room that is ending, and what to do once it has.
    @ObservationIgnored
    private var endingRoom: (id: UUID, surveyId: UUID, discard: Bool)?
    @ObservationIgnored
    private var startAfterEnding: UUID?
    
    /// A room RoomPlan ended on its own (lost tracking, too hot, too big…) before it was asked
    /// to. It's kept so ending the room uses it, rather than stopping a session that has already
    /// stopped and waiting for a hand-over that never comes.
    @ObservationIgnored
    private var endedEarly: (data: CapturedRoomData, error: (any Error)?)?

    /// Why RoomPlan stopped capturing the current room on its own, if it has.
    private(set) var stoppedReason: String?

    /// How long to wait for RoomPlan to hand over a room before giving up on it.
    @ObservationIgnored
    private let handOverTimeout: Duration = .seconds(10)

    /// Rooms being processed in the background, so a merge can wait for them.
    @ObservationIgnored
    private var processing: [UUID: Task<Void, Never>] = [:]
    
    /// Rooms deleted while still being processed; their results are thrown away.
    @ObservationIgnored
    private var discardedRoomIds: Set<UUID> = []

    func encode(with coder: NSCoder) {
        fatalError("Error when initializing ScanRoomModel")
    }
    
    required init?(coder: NSCoder) {
        fatalError("Error when initializing ScanRoomModel")
    }
    
    init() {
        captureSessionConfig = RoomCaptureSession.Configuration()
        
        structureBuilder = StructureBuilder(options: [.beautifyObjects])
    }
    
    var isSurveyActive: Bool {
        return activeSurveyId != nil
    }
    
    func isSurveying(_ surveyId: UUID) -> Bool {
        return activeSurveyId == surveyId
    }
    
    func isMerging(_ surveyId: UUID) -> Bool {
        return mergingSurveyId == surveyId
    }
    
    func mergeError(for surveyId: UUID) -> String? {
        return mergeError?.surveyId == surveyId ? mergeError?.message : nil
    }
    
    func mergedStructure(for surveyId: UUID) -> CapturedStructure? {
        return finalStructureSurveyId == surveyId ? finalStructure : nil
    }
    
    func startSurvey(surveyId: UUID) {
        guard activeSurveyId == nil else {
            print("A survey is already in progress")
            return
        }
        
        print("Starting survey \(surveyId)")
        
        let roomCaptureSession = RoomCaptureSession()
        self.roomCaptureSession = roomCaptureSession
        self.roomCaptureView = makeCaptureView(arSession: roomCaptureSession.arSession)
        self.captureViewUsed = false
        self.retiredCaptureViews = []
        self.activeSurveyId = surveyId
        self.walk = []
    }
    
    func stopSurvey() {
        self.activeSurveyId = nil
        capturingRoomId = nil
        endedEarly = nil
        stoppedReason = nil
        roomCaptureView?.captureSession.stop()
        roomCaptureView = nil
        retiredCaptureViews = []
        roomCaptureSession = nil
    }
    
    private func makeCaptureView(arSession: ARSession) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero, arSession: arSession)
        view.captureSession.delegate = self
        view.delegate = self
        return view
    }
    
    /// Starts capturing on a view that hasn't captured a room yet, so its camera feed shows.
    /// Every view shares the survey's AR session, so tracking carries on from room to room.
    @MainActor
    private func runCapture() {
        guard let roomCaptureSession, let current = roomCaptureView else { return }
        if captureViewUsed {
            retiredCaptureViews.append(current)
            roomCaptureView = makeCaptureView(arSession: roomCaptureSession.arSession)
        }
        captureViewUsed = true
        endedEarly = nil
        stoppedReason = nil
        roomCaptureView?.captureSession.run(configuration: captureSessionConfig)
    }

    /// Asks RoomPlan to end the current room, which it hands over in didEndWith. If it already
    /// ended the room on its own, that room is handed over straight away instead. Either way
    /// `endingRoom` must be set first.
    @MainActor
    private func stopCapture() {
        if let early = endedEarly {
            endedEarly = nil
            // Even when RoomPlan stopped with an error, what it captured up to then may still
            // build into a room; if it doesn't, processing marks the room failed.
            print("[scan] using the room RoomPlan ended on its own (error: \(String(describing: early.error)))")
            roomEnded(data: early.data, error: nil)
            return
        }
        roomCaptureView?.captureSession.stop(pauseARSession: false)

        // If RoomPlan never hands the room over, give up on it rather than leaving the walk stuck.
        let roomId = endingRoom?.id
        Task { @MainActor in
            try? await Task.sleep(for: self.handOverTimeout)
            guard self.isEndingRoom, self.endingRoom?.id == roomId else { return }
            print("[scan] RoomPlan didn't hand over room \(String(describing: roomId)); giving up on it")
            self.roomEnded(data: nil, error: nil)
        }
    }
    
    // MARK: - Walking round the home
    //
    // The camera stays up for the whole walk. Each room ends with stop(pauseARSession: false), so
    // tracking carries on into the next room while the ended one is processed in the background.
    
    /// The room being captured, if any.
    var capturingRoom: WalkRoom? {
        walk.first { $0.id == capturingRoomId }
    }
    
    /// The most recent room that has finished capturing.
    var lastFinishedRoom: WalkRoom? {
        walk.last { $0.id != capturingRoomId }
    }
    
    /// Starts capturing a new room. Which storey it's on is worked out by StructureBuilder when
    /// the rooms are merged.
    @MainActor
    func startRoom() {
        guard activeSurveyId != nil, capturingRoomId == nil, !isEndingRoom else { return }
        let id = UUID()
        walk.append(WalkRoom(id: id, name: "", status: .capturing))
        capturingRoomId = id
        runCapture()
    }
    
    /// Ends the room being captured with the name it's been given, and returns it so the caller
    /// can record it. The room is processed in the background. With `startNext`, the next room's
    /// capture starts straight away; otherwise (e.g. on "Finish home") nothing more is
    /// captured until `startRoom`.
    @MainActor
    func endRoom(name: String, startNext: Bool) -> WalkRoom? {
        // Only one room can be ending at a time; the next one starts once it has.
        guard !isEndingRoom, let id = capturingRoomId, let surveyId = activeSurveyId,
              let index = walk.firstIndex(where: { $0.id == id }) else { return nil }
        
        walk[index].name = name
        walk[index].status = .processing
        endingRoom = (id, surveyId, false)
        capturingRoomId = nil
        isEndingRoom = true
        
        if startNext {
            // Shown as capturing straight away; RoomPlan starts it once the ended room is handed over.
            let nextId = UUID()
            walk.append(WalkRoom(id: nextId, name: "", status: .capturing))
            capturingRoomId = nextId
            startAfterEnding = nextId
        }
        
        print("[scan] ending room \(id), startNext: \(startNext)")
        let ended = walk[index]
        stopCapture()
        return ended
    }
    
    /// Throws away the room being captured, keeping tracking running.
    @MainActor
    func cancelRoom() {
        guard let id = capturingRoomId else { return }
        walk.removeAll { $0.id == id }
        capturingRoomId = nil
        startAfterEnding = nil
        if let surveyId = activeSurveyId, !isEndingRoom {
            endingRoom = (id, surveyId, true)
            isEndingRoom = true
            stopCapture()
        }
    }
    
    /// Throws away the last finished room (and anything captured since) and captures it again,
    /// Returns the room that was thrown away, so the caller can remove its
    /// record and reuse its name.
    @MainActor
    func redoLastRoom() -> WalkRoom? {
        guard let last = lastFinishedRoom, let surveyId = activeSurveyId else { return nil }
        
        deleteRoomFiles(surveyId: surveyId, roomId: last.id)
        walk.removeAll { $0.id == last.id }
        
        let redoId = UUID()
        if let current = capturingRoomId {
            // Replace the room in progress with the redo. If RoomPlan is still handing over the
            // last room, the redo starts once it has; otherwise end the one in progress first.
            walk.removeAll { $0.id == current }
            // Set up the redo first: if RoomPlan already ended the room, it's handed over at once.
            walk.append(WalkRoom(id: redoId, name: "", status: .capturing))
            capturingRoomId = redoId
            startAfterEnding = redoId
            if !isEndingRoom {
                endingRoom = (current, surveyId, true)
                isEndingRoom = true
                stopCapture()
            }
        } else {
            capturingRoomId = nil
            startRoom()
        }
        return last
    }
    
    /// RoomPlan calls this when a room ends, whether it was asked to or stopped on its own, so
    /// it's where the room is handed over.
    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: (any Error)?) {
        print("[scan] didEndWith (error: \(String(describing: error)))")
        let sessionId = ObjectIdentifier(session)
        Task { @MainActor in
            // Earlier rooms' views are kept alive and share this delegate; only the current one counts.
            guard let current = self.roomCaptureView, ObjectIdentifier(current.captureSession) == sessionId else {
                print("[scan] ignoring didEndWith from an earlier room's session")
                return
            }
            if self.isEndingRoom {
                self.roomEnded(data: data, error: error)
            } else if self.capturingRoomId != nil {
                // RoomPlan stopped by itself. Keep what it captured for when the room is ended.
                print("[scan] RoomPlan ended room \(String(describing: self.capturingRoomId)) on its own")
                self.endedEarly = (data, error)
                self.stoppedReason = error?.localizedDescription ?? "Scanning stopped unexpectedly."
            } else {
                print("[scan] ignoring didEndWith with no room capturing or ending")
            }
        }
    }

    /// Hands over the room that was ending: `data` is what RoomPlan captured, or nil if it never
    /// handed the room over. Then starts the next room, if one is waiting.
    @MainActor
    private func roomEnded(data: CapturedRoomData?, error: (any Error)?) {
        let ended = endingRoom
        endingRoom = nil
        isEndingRoom = false

        if let ended, !ended.discard, !discardedRoomIds.contains(ended.id) {
            if let error {
                print("Error ending capture session; \(error)")
                setStatus(.failed(error.localizedDescription), for: ended.id)
                scanError = (ended.id, error.localizedDescription)
            } else if let data {
                process(data, roomId: ended.id, surveyId: ended.surveyId)
            } else {
                let message = "RoomPlan didn't finish this room."
                setStatus(.failed(message), for: ended.id)
                scanError = (ended.id, message)
            }
        }
        
        // Start the room waiting to start (from "Next room" or "Redo"), on a fresh view.
        if let next = startAfterEnding, next == capturingRoomId, activeSurveyId != nil {
            startAfterEnding = nil
            print("[scan] starting next room \(next)")
            runCapture()
        }
    }
    
    /// Turns a room's raw capture into a CapturedRoom and saves it, in the background.
    @MainActor
    private func process(_ data: CapturedRoomData, roomId: UUID, surveyId: UUID) {
        processing[roomId] = Task { @MainActor in
            defer { self.processing[roomId] = nil }
            do {
                let room = try await self.roomBuilder.capturedRoom(from: data)
                // Deleted (or redone) while it was being processed.
                guard !self.discardedRoomIds.contains(roomId) else { return }
                try self.save(room, roomId: roomId, surveyId: surveyId)
                self.savedRoomIds.insert(roomId)
                if let index = self.walk.firstIndex(where: { $0.id == roomId }) {
                    self.walk[index].status = .saved
                    self.walk[index].walls = room.walls.map(Self.wallLine)
                }
            } catch {
                print("Failed to process or save room \(error)")
                self.setStatus(.failed(error.localizedDescription), for: roomId)
                self.scanError = (roomId, error.localizedDescription)
            }
        }
    }
    
    private func save(_ room: CapturedRoom, roomId: UUID, surveyId: UUID) throws {
        let destinationFolderURL = scanFolderURL(surveyId: surveyId)
        try FileManager.default.createDirectory(at: destinationFolderURL, withIntermediateDirectories: true)
        try JSONEncoder().encode(room).write(to: destinationFolderURL.appending(path: "\(roomId).json"))
        try room.export(to: destinationFolderURL.appending(path: "\(roomId).usdz"))
    }
    
    /// A wall's centre line seen from above.
    private static func wallLine(_ wall: CapturedRoom.Surface) -> WallLine {
        let t = wall.transform
        let half = wall.dimensions.x / 2
        let (cx, cz) = (t.columns.3.x, t.columns.3.z)
        let (dx, dz) = (t.columns.0.x * half, t.columns.0.z * half)
        return WallLine(a: CGPoint(x: CGFloat(cx - dx), y: CGFloat(cz - dz)),
                        b: CGPoint(x: CGFloat(cx + dx), y: CGFloat(cz + dz)))
    }
    
    @MainActor
    private func setStatus(_ status: WalkRoom.Status, for roomId: UUID) {
        if let index = walk.firstIndex(where: { $0.id == roomId }) {
            walk[index].status = status
        }
    }
    
    /// Waits for every room still being handed over or processed, e.g. before merging.
    @MainActor
    func waitForProcessing() async {
        // RoomPlan normally hands a room over within a second; don't wait forever if it doesn't.
        var handOverWait = 0
        while isEndingRoom || !processing.isEmpty {
            if let task = processing.values.first {
                await task.value
            } else if handOverWait < 100 {
                handOverWait += 1
                try? await Task.sleep(for: .milliseconds(100))
            } else {
                print("Gave up waiting for RoomPlan to hand over the last room")
                return
            }
        }
    }
    
    /// Ends the survey's scanning session and merges its rooms, once every room is processed.
    @MainActor
    func completeSurvey(surveyId: UUID) async {
        await waitForProcessing()
        if isSurveying(surveyId) {
            stopSurvey()
        }
        await mergeRooms(surveyId: surveyId)
    }
    
    /// Rooms are processed by the model as they end, so RoomCaptureView doesn't show its own
    /// results screen.
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) async -> Bool {
        return false
    }

    func scanError(for roomId: UUID) -> String? {
        return scanError?.roomId == roomId ? scanError?.message : nil
    }
    
    /// Removes a room's saved scan files so it is no longer included in the merge.
    func deleteRoomFiles(surveyId: UUID, roomId: UUID) {
        let folderURL = scanFolderURL(surveyId: surveyId)
        for ext in ["json", "usdz"] {
            let url = folderURL.appending(path: "\(roomId).\(ext)")
            if FileManager.default.fileExists(atPath: url.path()) {
                try? FileManager.default.removeItem(at: url)
            }
        }
        savedRoomIds.remove(roomId)
        // If this room is still being handed over or processed, drop the result rather than
        // saving it later.
        discardedRoomIds.insert(roomId)
        walk.removeAll { $0.id == roomId }
    }
    
    /// Removes every scan file for a survey, e.g. when restarting it.
    func deleteSurveyFiles(surveyId: UUID) {
        let folderURL = scanFolderURL(surveyId: surveyId)
        if FileManager.default.fileExists(atPath: folderURL.path()) {
            try? FileManager.default.removeItem(at: folderURL)
        }
        if finalStructureSurveyId == surveyId {
            finalStructure = nil
            finalStructureSurveyId = nil
        }
    }
    
    func isUploading(_ surveyId: UUID) -> Bool {
        return uploadingSurveyId == surveyId
    }
    
    func uploadError(for surveyId: UUID) -> String? {
        return uploadError?.surveyId == surveyId ? uploadError?.message : nil
    }
    
    /// Uploads the survey's merged scan to heatlossdb, tracking progress and errors for the views.
    /// Returns the new upload's id and its private link on the website.
    @MainActor
    func upload(surveyId: UUID) async -> SurveyUpload? {
        guard uploadingSurveyId == nil else { return nil }
        
        uploadingSurveyId = surveyId
        uploadError = nil
        defer { uploadingSurveyId = nil }
        
        do {
            return try await performUpload(surveyId: surveyId)
        } catch {
            print("Failed to upload survey \(error)")
            uploadError = (surveyId, error.localizedDescription)
            return nil
        }
    }
    
    private func performUpload(surveyId: UUID) async throws -> SurveyUpload {
        guard let base = Bundle.main.object(forInfoDictionaryKey: "HeatLossDBAPIBaseURL") as? String,
              let baseURL = URL(string: base) else {
            throw UploadFailure.notConfigured
        }
        
        let scanURL = scanFolderURL(surveyId: surveyId).appending(path: mergedStructureFileName)
        guard FileManager.default.fileExists(atPath: scanURL.path()) else {
            throw UploadFailure.noScan
        }
        
        var request = URLRequest(url: baseURL.appending(path: "api/surveys"))
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(surveyId.uuidString, forHTTPHeaderField: "X-App-Survey-Id")
        
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.upload(for: request, fromFile: scanURL)
        } catch let error as URLError {
            throw UploadFailure.unreachable(host: baseURL.host() ?? base, underlying: error)
        }
        
        guard let http = response as? HTTPURLResponse, http.statusCode == 201 else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let message = (try? JSONDecoder().decode(UploadErrorBody.self, from: data))?.error
            throw UploadFailure.rejected(message ?? "The server returned status \(status).")
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(SurveyUpload.self, from: data)
    }
    
    /// The merged survey files (USDZ model and JSON structure) that exist on disk, for sharing.
    func mergedFileURLs(surveyId: UUID) -> [URL] {
        let folderURL = scanFolderURL(surveyId: surveyId)
        return [mergedModelFileName, mergedStructureFileName]
            .map { folderURL.appending(path: $0) }
            .filter { FileManager.default.fileExists(atPath: $0.path()) }
    }
    
    /// Loads or merges the survey's rooms, tracking progress and errors for the views.
    @MainActor
    func mergeRooms(surveyId: UUID) async {
        guard mergingSurveyId == nil else { return }
        
        mergingSurveyId = surveyId
        mergeError = nil
        
        do {
            _ = try await mergeAllRooms(surveyId: surveyId)
        } catch {
            print("Failed to merge rooms \(error)")
            mergeError = (surveyId, error.localizedDescription)
        }
        
        mergingSurveyId = nil
    }
    
    /// Returns the merged structure for a survey. The merge is persisted as merged.json in the
    /// survey's scan folder and reused until the set of room scans (or any room scan) changes.
    @MainActor
    private func mergeAllRooms(surveyId: UUID) async throws -> CapturedStructure {
        
        let destinationFolderURL = scanFolderURL(surveyId: surveyId)
        let mergedURL = destinationFolderURL.appending(path: mergedStructureFileName)
        let mergedInputsURL = destinationFolderURL.appending(path: mergedInputsFileName)
        let mergedModelURL = destinationFolderURL.appending(path: mergedModelFileName)
        
        // Room scans are saved as <roomId>.json; anything else in the folder isn't a room.
        //
        let items = try FileManager.default.contentsOfDirectory(at: destinationFolderURL, includingPropertiesForKeys: [.contentModificationDateKey])
        
        let files = items.filter {
            $0.pathExtension == "json" && UUID(uuidString: $0.deletingPathExtension().lastPathComponent) != nil
        }
        
        let inputs = try mergeInputs(for: files)
        
        if let cached = loadMergedStructure(from: mergedURL, inputsURL: mergedInputsURL, expectedInputs: inputs) {
            print("Loaded merged structure from \(mergedURL)")
            if !FileManager.default.fileExists(atPath: mergedModelURL.path()) {
                do {
                    try exportModel(structure: cached, to: mergedModelURL)
                } catch {
                    print("Failed to export merged model \(error)")
                }
            }
            self.finalStructure = cached
            self.finalStructureSurveyId = surveyId
            return cached
        }
        
        let structure = try await mergeSelectedRooms(urls: files)
        self.finalStructure = structure
        self.finalStructureSurveyId = surveyId
        
        do {
            try exportJson(from: structure, to: mergedURL)
            try JSONEncoder().encode(inputs).write(to: mergedInputsURL)
        } catch {
            print("Failed to save merged structure \(error)")
        }
        
        do {
            try exportModel(structure: structure, to: mergedModelURL)
        } catch {
            print("Failed to export merged model \(error)")
        }
        
        return structure
    }
    
    /// The room's own 3D model, if it was saved. Reads `savedRoomIds` so views update the moment
    /// a room finishes saving; the file check covers rooms saved in an earlier launch.
    func roomModelURL(surveyId: UUID, roomId: UUID) -> URL? {
        let url = scanFolderURL(surveyId: surveyId).appending(path: "\(roomId).usdz")
        let justSaved = savedRoomIds.contains(roomId)
        return justSaved || FileManager.default.fileExists(atPath: url.path()) ? url : nil
    }
    
    func scanFolderURL(surveyId: UUID) -> URL {
        return getDocumentsDirectory().appending(path: "Scans").appending(path: "\(surveyId.uuidString)")
    }
    
    func getDocumentsDirectory() -> URL {
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        let documentsDirectory = paths[0]
        return documentsDirectory
    }
    
    /// HeatLossDB's version of merged.json, saved as "heatlossdbVersion" beside RoomPlan's own
    /// "version" so the website knows what it's reading. Increase it when the file changes shape.
    @ObservationIgnored
    private let heatlossdbVersion = 1
    @ObservationIgnored
    private let mergedStructureFileName = "merged.json"
    @ObservationIgnored
    private let mergedInputsFileName = "merged-inputs.json"
    @ObservationIgnored
    private let mergedModelFileName = "merged.usdz"
    
    // File name -> modification date of each room scan that went into a merge.
    private func mergeInputs(for urls: [URL]) throws -> [String: Date] {
        var inputs: [String: Date] = [:]
        for url in urls {
            let values = try url.resourceValues(forKeys: [.contentModificationDateKey])
            inputs[url.lastPathComponent] = values.contentModificationDate ?? .distantPast
        }
        return inputs
    }
    
    private func loadMergedStructure(from url: URL, inputsURL: URL, expectedInputs: [String: Date]) -> CapturedStructure? {
        guard let inputsData = try? Data(contentsOf: inputsURL),
              let inputs = try? JSONDecoder().decode([String: Date].self, from: inputsData),
              inputs == expectedInputs,
              let data = try? Data(contentsOf: url),
              // A merge saved before the current file format is merged again, so it's saved in it.
              (try? JSONDecoder().decode(FileVersion.self, from: data))?.heatlossdbVersion == heatlossdbVersion else { return nil }
        
        return try? JSONDecoder().decode(CapturedStructure.self, from: data)
    }
    
    @MainActor
    private func mergeSelectedRooms(urls: [URL]) async throws -> CapturedStructure {
        
        var capturedRoomArray: [CapturedRoom] = []
        for url in urls {
            guard let room = try? loadCapturedRoom(from: url) else { continue }
            capturedRoomArray.append(room)
        }
        
        return try await structureBuilder.capturedStructure(from: capturedRoomArray)
    }
    
    private func loadCapturedRoom(from url: URL) throws -> CapturedRoom? {
        let jsonData = try? Data(contentsOf: url)
        guard let data = jsonData else { return nil }
        let capturedRoom = try? JSONDecoder().decode(CapturedRoom.self, from: data)
        return capturedRoom
    }
    
    func exportJson(from capturedStructure: CapturedStructure, to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(VersionedStructure(structure: capturedStructure, heatlossdbVersion: heatlossdbVersion))
        try data.write(to: url)
    }
    
    /// Exports the merged structure as a USDZ model (with its metadata plist alongside).
    private func exportModel(structure: CapturedStructure, to url: URL) throws {
        if FileManager.default.fileExists(atPath: url.path()) {
            try FileManager.default.removeItem(at: url)
        }
        let metadataURL = url.deletingPathExtension().appendingPathExtension("plist")
        try structure.export(to: url, metadataURL: metadataURL, exportOptions: [.mesh])
    }
}

/// A captured structure with HeatLossDB's file version alongside RoomPlan's own keys.
private struct VersionedStructure: Encodable {
    let structure: CapturedStructure
    let heatlossdbVersion: Int
    
    private enum CodingKeys: String, CodingKey {
        case heatlossdbVersion
    }
    
    func encode(to encoder: Encoder) throws {
        try structure.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(heatlossdbVersion, forKey: .heatlossdbVersion)
    }
}

/// Reads just the file version from merged.json.
private struct FileVersion: Decodable {
    let heatlossdbVersion: Int?
}

/// A survey uploaded to heatlossdb: its id, its private link on the website, and a short code
/// for typing into the website instead.
struct SurveyUpload: Decodable {
    let id: String
    let url: URL
    let code: String?
    let codeExpiresAt: Date?
}

private struct UploadErrorBody: Decodable {
    let error: String
}

enum UploadFailure: LocalizedError {
    case notConfigured
    case noScan
    case unreachable(host: String, underlying: URLError)
    case rejected(String)
    
    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "The app doesn't know where heatlossdb is (HeatLossDBAPIBaseURL is missing from Info.plist)."
        case .noScan:
            return "The merged scan hasn't been saved yet. Wait for merging to finish, then try again."
        case .unreachable(let host, let underlying):
            return "Couldn't reach heatlossdb at \(host). Check the server is running and you're on the same Wi-Fi. (\(underlying.localizedDescription))"
        case .rejected(let message):
            return message
        }
    }
}
