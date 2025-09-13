from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.client_projects: Dict[str, List[int]] = {}  # client_id -> project_ids
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"Client {client_id} connected")
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if client_id in self.client_projects:
            del self.client_projects[client_id]
        print(f"Client {client_id} disconnected")
    
    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            try:
                await websocket.send_text(json.dumps(message))
            except:
                # Connection might be closed
                self.disconnect(client_id)
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected_clients = []
        
        for client_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(json.dumps(message))
            except:
                # Connection might be closed
                disconnected_clients.append(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)
    
    async def broadcast_to_project(self, message: dict, project_id: int):
        """Broadcast message to clients subscribed to a specific project"""
        message["project_id"] = project_id
        
        disconnected_clients = []
        
        for client_id, websocket in self.active_connections.items():
            # Check if client is subscribed to this project
            if client_id in self.client_projects:
                if project_id in self.client_projects[client_id]:
                    try:
                        await websocket.send_text(json.dumps(message))
                    except:
                        disconnected_clients.append(client_id)
            else:
                # If no specific subscription, send to all (for demo purposes)
                try:
                    await websocket.send_text(json.dumps(message))
                except:
                    disconnected_clients.append(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)
    
    def subscribe_to_project(self, client_id: str, project_id: int):
        """Subscribe a client to project updates"""
        if client_id not in self.client_projects:
            self.client_projects[client_id] = []
        
        if project_id not in self.client_projects[client_id]:
            self.client_projects[client_id].append(project_id)
    
    def get_connected_clients(self) -> List[str]:
        """Get list of connected client IDs"""
        return list(self.active_connections.keys())
