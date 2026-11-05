//
//  FloorPlanSurface.swift
//  RoomPlan 2D
//
//  Created by Dennis van Oosten on 12/03/2023.
//

import SpriteKit
import RoomPlan

class FloorPlanSurface: SKNode {
    
    private let capturedSurface: CapturedRoom.Surface
    
    // MARK: - Computed properties
    
    private var halfLength: CGFloat {
        return CGFloat(capturedSurface.dimensions.x) * scalingFactor / 2
    }
    
    private var pointA: CGPoint {
        return CGPoint(x: -halfLength, y: 0)
    }
    
    private var pointB: CGPoint {
        return CGPoint(x: halfLength, y: 0)
    }
    
    // MARK: - Init
    
    init(capturedSurface: CapturedRoom.Surface) {
        self.capturedSurface = capturedSurface
        
        super.init()
        
        // Set the surface's position using the transform matrix
        let surfacePositionX = -CGFloat(capturedSurface.transform.position.x) * scalingFactor
        let surfacePositionY = CGFloat(capturedSurface.transform.position.z) * scalingFactor
        self.position = CGPoint(x: surfacePositionX, y: surfacePositionY)
        
        // Set the surface's zRotation using the transform matrix
        self.zRotation = -CGFloat(capturedSurface.transform.eulerAngles.z - capturedSurface.transform.eulerAngles.y)
        
        // Draw the right surface
        switch capturedSurface.category {
        case .door, .opening:
            drawDoorway()
        case .wall:
            drawWall()
        case .window:
            drawWindow()
        case .floor:
            return
        @unknown default:
            drawWall()
        }
    }
    
    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Draw
    
    /// Doors and openings are drawn the same way: the doorway is highlighted across the wall,
    /// without the door leaf or its swing arc.
    private func drawDoorway() {
        let doorwayPath = createPath(from: pointA, to: pointB)
        
        let doorwayShape = createShapeNode(from: doorwayPath)
        doorwayShape.strokeColor = floorPlanDoorwayColor
        doorwayShape.lineWidth = hideSurfaceWith
        doorwayShape.zPosition = doorwayZPosition
        
        addChild(doorwayShape)
    }
    
    private func drawWall() {
        let wallPath = createPath(from: pointA, to: pointB)
        let wallShape = createShapeNode(from: wallPath)
        wallShape.lineCap = .square
        
        addChild(wallShape)
    }
    
    private func drawWindow() {
        let windowPath = createPath(from: pointA, to: pointB)
        
        // Hide the wall underneath the window
        let hideWallShape = createShapeNode(from: windowPath)
        hideWallShape.strokeColor = floorPlanBackgroundColor
        hideWallShape.lineWidth = hideSurfaceWith
        hideWallShape.zPosition = hideSurfaceZPosition
        
        // The window itself
        let windowShape = createShapeNode(from: windowPath)
        windowShape.lineWidth = windowWidth
        windowShape.zPosition = windowZPosition
        
        addChild(hideWallShape)
        addChild(windowShape)
    }
    
    // MARK: - Helper functions
    
    private func createPath(from pointA: CGPoint, to pointB: CGPoint) -> CGMutablePath {
        let path = CGMutablePath()
        path.move(to: pointA)
        path.addLine(to: pointB)
        
        return path
    }
    
    private func createShapeNode(from path: CGPath) -> SKShapeNode {
        let shapeNode = SKShapeNode(path: path)
        shapeNode.strokeColor = floorPlanSurfaceColor
        shapeNode.lineWidth = surfaceWith
        
        return shapeNode
    }
    
}
