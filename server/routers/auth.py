import os

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from ..database import get_db, user_service

router = APIRouter()

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

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
    # 開発環境用のリダイレクトURI
    redirect_uri = str(request.base_url) + "api/auth/callback"
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
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
        "sub": userinfo["sub"],
        "email": userinfo.get("email"),
        "name": userinfo.get("name"),
        "picture": userinfo.get("picture"),
    }
    return RedirectResponse(url="/api/auth/me")


@router.get("/me")
async def me(request: Request):
    user = request.session.get("user")
    if not user:
        return RedirectResponse(url="/api/auth/login")
    return JSONResponse(user)


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return JSONResponse({"ok": True})
