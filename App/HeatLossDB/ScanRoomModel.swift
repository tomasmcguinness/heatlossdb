//
//  ScanRoomModel.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 09/03/2024.
//

import Foundation
import Observation
import RoomPlan

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
    
    // The room (and its survey) being captured, so the result is saved to the right place
    // even if the survey is completed before RoomPlan finishes processing.
    @ObservationIgnored
    private var roomId: UUID?
    @ObservationIgnored
    private var roomSurveyId: UUID?
    
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
        let roomCaptureView = RoomCaptureView(frame: .zero, arSession: roomCaptureSession.arSession)
        roomCaptureView.captureSession.delegate = self
        roomCaptureView.delegate = self
        
        self.roomCaptureSession = roomCaptureSession
        self.roomCaptureView = roomCaptureView
        self.activeSurveyId = surveyId
    }
    
    func startCapture(roomId: UUID) {
        guard let activeSurveyId, let roomCaptureView else {
            print("No survey in progress")
            return
        }
        
        print("Starting capture session for room \(roomId) - \(activeSurveyId)")
        
        self.roomId = roomId
        self.roomSurveyId = activeSurveyId
        self.scanError = nil
        
        roomCaptureView.captureSession.run(configuration: captureSessionConfig)
    }
    
    func pauseCapture() {
        print("Pausing capture session")
        roomCaptureView?.captureSession.stop(pauseARSession: false)
    }
    
    func stopSurvey() {
        self.activeSurveyId = nil
        roomCaptureView?.captureSession.stop()
        roomCaptureView = nil
        roomCaptureSession = nil
    }
    
    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: (any Error)?) {
        if let error {
            print("Error ending capture session; \(error)")
        }
    }
    
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) async -> Bool {
        print("captureView finished")
        return true
    }
    
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard let roomId, let roomSurveyId else {
            print("captureView presented a room with no room or survey to save it to")
            return
        }
        
        if let error {
            print("captureView presented captured room - \(error)")
            Task { @MainActor in
                self.scanError = (roomId, error.localizedDescription)
            }
            return
        }
        
        Task { @MainActor in
            do {
                let destinationFolderURL = scanFolderURL(surveyId: roomSurveyId)
                let destinationURL = destinationFolderURL.appending(path: "\(roomId).usdz")
                let capturedRoomURL = destinationFolderURL.appending(path: "\(roomId).json")
                
                try FileManager.default.createDirectory(at: destinationFolderURL, withIntermediateDirectories: true)
                
                let jsonEncoder = JSONEncoder()
                let jsonData = try jsonEncoder.encode(processedResult)
                try jsonData.write(to: capturedRoomURL)
                
                try processedResult.export(to: destinationURL)
                
                self.savedRoomIds.insert(roomId)
            } catch {
                print("Failed to save scan \(error)")
                self.scanError = (roomId, error.localizedDescription)
            }
        }
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
        // If this room is still being processed, drop the result rather than saving it later.
        if self.roomId == roomId {
            self.roomId = nil
            self.roomSurveyId = nil
        }
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
        return try JSONDecoder().decode(SurveyUpload.self, from: data)
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
    
    func scanFolderURL(surveyId: UUID) -> URL {
        return getDocumentsDirectory().appending(path: "Scans").appending(path: "\(surveyId.uuidString)")
    }
    
    func getDocumentsDirectory() -> URL {
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        let documentsDirectory = paths[0]
        return documentsDirectory
    }
    
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
              let data = try? Data(contentsOf: url) else { return nil }
        
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
        let data = try encoder.encode(capturedStructure)
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

/// A survey uploaded to heatlossdb: its id and its private link on the website.
struct SurveyUpload: Decodable {
    let id: String
    let url: URL
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
