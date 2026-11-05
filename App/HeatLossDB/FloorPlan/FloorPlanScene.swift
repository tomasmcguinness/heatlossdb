//
//  FloorPlanScene.swift
//  RoomPlan 2D
//
//  Created by Dennis van Oosten on 10/03/2023.
//

import RoomPlan
import SpriteKit

class FloorPlanScene: SKScene {
    
    // MARK: - Properties
    
    private let surfaces: [CapturedStructure.Surface]
    
    // MARK: - Init
    
    init(capturedRoom: CapturedStructure) {
        // Furniture is left off the plan; doors and openings are drawn as highlighted doorways.
        self.surfaces = capturedRoom.walls + capturedRoom.windows + capturedRoom.doors + capturedRoom.openings
        
        super.init(size: CGSize(width: 1500, height: 1500))
        
        self.scaleMode = .aspectFill
        self.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        self.backgroundColor = floorPlanBackgroundColor
        
        addCamera()
        
        drawSurfaces()
    }
    
    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func didMove(to view: SKView) {
        let panGestureRecognizer = UIPanGestureRecognizer()
        panGestureRecognizer.addTarget(self, action: #selector(panGestureAction(_:)))
        view.addGestureRecognizer(panGestureRecognizer)
        
        let pinchGestureRecognizer = UIPinchGestureRecognizer()
        pinchGestureRecognizer.addTarget(self, action: #selector(pinchGestureAction(_:)))
        view.addGestureRecognizer(pinchGestureRecognizer)
    }
    
    // MARK: - Draw
    
    private func drawSurfaces() {
        for surface in surfaces {
            let surfaceNode = FloorPlanSurface(capturedSurface: surface)
            addChild(surfaceNode)
        }
    }
    
    // MARK: - Camera
    
    private func addCamera() {
        let cameraNode = SKCameraNode()
        addChild(cameraNode)
        
        self.camera = cameraNode
    }
    
    // Variables that store camera scale and position at the start of a gesture
    private var previousCameraScale = CGFloat()
    private var previousCameraPosition = CGPoint()
    
    // Pan gestures only handle camera movement in this scene
    @objc private func panGestureAction(_ sender: UIPanGestureRecognizer) {
        guard let camera = self.camera else { return }
        
        if sender.state == .began {
            previousCameraPosition = camera.position
        }
        
        let translationScale = camera.xScale
        let panTranslation = sender.translation(in: self.view)
        let newCameraPosition = CGPoint(
            x: previousCameraPosition.x + panTranslation.x * -translationScale,
            y: previousCameraPosition.y + panTranslation.y * translationScale
        )
        
        camera.position = newCameraPosition
    }
    
    // Pinch gestures only handle camera movement in this scene
    @objc private func pinchGestureAction(_ sender: UIPinchGestureRecognizer) {
        guard let camera = self.camera else { return }
        
        if sender.state == .began {
            previousCameraScale = camera.xScale
        }
        
        camera.setScale(previousCameraScale * 1 / sender.scale)
    }
    
}
