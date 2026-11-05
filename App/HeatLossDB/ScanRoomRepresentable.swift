//
//  ScanRoomRepresentable.swift
//  HeatLossDB
//
//  Created by Tomas McGuinness on 09/03/2024.
//

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
