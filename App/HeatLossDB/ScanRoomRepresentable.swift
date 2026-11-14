//
//  ScanRoomRepresentable.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 09/03/2024.
//

import ARKit
import Foundation

import RoomPlan
import SwiftUI

struct ScanRoomRepresentable: UIViewRepresentable {
    
    let roomCaptureView: RoomCaptureView
    
    func makeUIView(context: Context) -> RoomCaptureView {
        return roomCaptureView
    }
    
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {
    }
    
}

/// The live camera feed from the survey's AR session, shown between rooms. It draws nothing of
/// its own and doesn't change the session, so tracking carries on into the next room.
struct CameraFeedRepresentable: UIViewRepresentable {
    
    let session: ARSession
    
    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = session
        view.automaticallyUpdatesLighting = false
        return view
    }
    
    func updateUIView(_ uiView: ARSCNView, context: Context) {
    }
}
