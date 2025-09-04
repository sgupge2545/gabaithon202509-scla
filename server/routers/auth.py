import logging
import os

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db, user_service


# レスポンスモデル定義
class UserResponse(BaseModel):
    id: str
    sub: str
    email: str
    name: str
    picture: str | None = None


class LogoutResponse(BaseModel):
    ok: bool


router = APIRouter()
logger = logging.getLogger(__name__)

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL")
BACKEND_URL = os.getenv("BACKEND_URL")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile",
    },
)


@router.get("/login")
async def login(request: Request):
    try:
        request.session.clear()
        redirect_uri = f"{BACKEND_URL}/api/auth/callback"
        return await oauth.google.authorize_redirect(
            request, redirect_uri, prompt="select_account"
        )
    except Exception:
        logger.exception("/auth/login でエラーが発生しました")
        raise HTTPException(status_code=500, detail="ログイン開始に失敗しました")


@router.get("/callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo")
        if not userinfo:
            userinfo = await oauth.google.userinfo(token=token)

        idp_id = userinfo["sub"]
        email = userinfo.get("email")
        name = userinfo.get("name", "")
        picture_url = userinfo.get("picture")

        db_user = user_service.create_or_update_user(
            db=db, idp_id=idp_id, email=email, name=name, picture_url=picture_url
        )

        request.session["user"] = {
            "id": db_user.id,
            "idp_id": db_user.idp_id,
            "email": db_user.email,
            "name": db_user.name,
            "picture_url": db_user.picture_url,
        }
        return RedirectResponse(url=FRONTEND_URL)
    except Exception:
        logger.exception("/auth/callback でエラーが発生しました")
        raise HTTPException(status_code=500, detail="認証処理に失敗しました")


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
    try:
        user = request.session.get("user")
        if not user:
            return RedirectResponse(url="/api/auth/login")

        if "idp_id" in user:
            return UserResponse(
                id=user["id"],
                sub=user["idp_id"],
                email=user["email"],
                name=user["name"],
                picture=user["picture_url"],
            )
        else:
            return UserResponse(**user)
    except Exception:
        logger.exception("/auth/me でエラーが発生しました")
        raise HTTPException(status_code=500, detail="ユーザー情報の取得に失敗しました")


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request):
    try:
        request.session.clear()
        return {"ok": True}
    except Exception:
        logger.exception("/auth/logout でエラーが発生しました")
        raise HTTPException(status_code=500, detail="ログアウトに失敗しました")
