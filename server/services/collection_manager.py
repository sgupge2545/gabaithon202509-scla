import asyncio
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # room_id -> list of WebSocket
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.setdefault(room_id, []).append(websocket)

    async def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self.active_connections.get(room_id)
            if not conns:
                return
            try:
                conns.remove(websocket)
            except ValueError:
                pass

    async def broadcast(self, room_id: str, message: dict) -> None:
        conns = list(self.active_connections.get(room_id, []))
        if not conns:
            return
        # send concurrently
        await asyncio.gather(*(conn.send_json(message) for conn in conns))


manager = ConnectionManager()
