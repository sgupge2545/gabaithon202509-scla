import os

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, Request
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

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL")

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
    request.session.clear()
    # 開発環境用のリダイレクトURI
    redirect_uri = str(request.base_url) + "api/auth/callback"
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        prompt="select_account",
    )


@router.get("/callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo:
        userinfo = await oauth.google.userinfo(token=token)

    # Googleから取得したユーザー情報
    idp_id = userinfo["sub"]
    email = userinfo.get("email")
    name = userinfo.get("name", "")
    picture_url = userinfo.get("picture")

    # データベースにユーザー情報を保存または更新
    db_user = user_service.create_or_update_user(
        db=db, idp_id=idp_id, email=email, name=name, picture_url=picture_url
    )

    # セッションにユーザー情報を保存
    request.session["user"] = {
        "id": db_user.id,
        "idp_id": db_user.idp_id,
        "email": db_user.email,
        "name": db_user.name,
        "picture_url": db_user.picture_url,
    }
    return RedirectResponse(url=FRONTEND_URL)


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
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


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}
