"""
ルーム関連のAPIエンドポイント
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db, room_service
from ..database.models import Room, User


# レスポンスモデル
class RoomResponse(BaseModel):
    id: str
    title: str
    visibility: str
    capacity: int
    member_count: int
    created_at: str

    class Config:
        from_attributes = True


class RoomMemberResponse(BaseModel):
    id: str
    name: str
    picture: Optional[str] = None

    class Config:
        from_attributes = True


class RoomDetailResponse(BaseModel):
    id: str
    title: str
    visibility: str
    capacity: int
    members: List[RoomMemberResponse]
    created_at: str

    class Config:
        from_attributes = True


# リクエストモデル
class CreateRoomRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    visibility: str = Field(..., pattern="^(public|passcode)$")
    passcode: Optional[str] = Field(None)
    capacity: int = Field(5, ge=1, le=10)

    @field_validator("passcode")
    @classmethod
    def validate_passcode(cls, v, info):
        visibility = info.data.get("visibility")

        # 空文字列をNoneに変換
        if v == "":
            v = None

        # パスコード設定時はパスコードが必須
        if visibility == "passcode" and not v:
            raise ValueError("パスコード設定時はパスコードが必要です")

        # パスコードがある場合は長さチェック
        if v and (len(v) < 1 or len(v) > 50):
            raise ValueError("パスコードは1〜50文字で入力してください")

        return v


class JoinRoomRequest(BaseModel):
    passcode: Optional[str] = None


router = APIRouter()


def get_current_user(request: Request) -> dict:
    """現在のユーザーを取得（セッションから）"""
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    return user


@router.post("/create", response_model=RoomResponse)
async def create_room(
    room_data: CreateRoomRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """新しいルームを作成"""
    current_user = get_current_user(request)

    # パスコード必須チェック
    if room_data.visibility == "passcode" and not room_data.passcode:
        raise HTTPException(status_code=400, detail="パスコードが必要です")

    try:
        room = room_service.create_room(
            db=db,
            title=room_data.title,
            creator_user_id=current_user["id"],
            visibility=room_data.visibility,
            passcode=room_data.passcode,
            capacity=room_data.capacity,
        )

        return RoomResponse(
            id=room.id,
            title=room.title,
            visibility=room.visibility,
            capacity=room.capacity,
            member_count=1,  # 作成者が自動参加
            created_at=room.created_at,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="ルーム作成に失敗しました")


@router.get("/public", response_model=List[RoomResponse])
async def get_public_rooms(db: Session = Depends(get_db)):
    """公開ルーム一覧を取得"""
    rooms = room_service.get_public_rooms(db)

    result = []
    for room in rooms:
        member_count = len(room.members)
        result.append(
            RoomResponse(
                id=room.id,
                title=room.title,
                visibility=room.visibility,
                capacity=room.capacity,
                member_count=member_count,
                created_at=room.created_at,
            )
        )

    return result


@router.get("/{room_id}", response_model=RoomDetailResponse)
async def get_room_detail(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """ルーム詳細を取得"""
    current_user = get_current_user(request)

    room = room_service.get_room_by_id(db, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="ルームが見つかりません")

    # 参加チェック
    is_member = room_service.is_user_in_room(db, room_id, current_user["id"])
    if not is_member:
        raise HTTPException(status_code=403, detail="ルームに参加していません")

    members = room_service.get_room_members(db, room_id)
    member_responses = [
        RoomMemberResponse(
            id=user.id,
            name=user.name,
            picture=user.picture_url,
        )
        for user in members
    ]

    return RoomDetailResponse(
        id=room.id,
        title=room.title,
        visibility=room.visibility,
        capacity=room.capacity,
        members=member_responses,
        created_at=room.created_at,
    )


@router.post("/{room_id}/join")
async def join_room(
    room_id: str,
    join_data: JoinRoomRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """ルームに参加"""
    current_user = get_current_user(request)

    success = room_service.join_room(
        db=db,
        room_id=room_id,
        user_id=current_user["id"],
        passcode=join_data.passcode,
    )

    if not success:
        raise HTTPException(
            status_code=400,
            detail="参加に失敗しました（定員超過・パスコード間違い・ルームが存在しません）",
        )

    return {"message": "参加しました"}


@router.delete("/{room_id}/leave")
async def leave_room(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """ルームから退出"""
    current_user = get_current_user(request)

    success = room_service.leave_room(
        db=db,
        room_id=room_id,
        user_id=current_user["id"],
    )

    if not success:
        raise HTTPException(status_code=500, detail="退出に失敗しました")

    return {"message": "退出しました"}


@router.delete("/{room_id}")
async def delete_room(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """ルームを削除（作成者のみ）"""
    current_user = get_current_user(request)

    success = room_service.delete_room(
        db=db,
        room_id=room_id,
        user_id=current_user["id"],
    )

    if not success:
        raise HTTPException(
            status_code=403,
            detail="ルーム削除に失敗しました（権限がないか、ルームが存在しません）",
        )

    return {"message": "ルームを削除しました"}
