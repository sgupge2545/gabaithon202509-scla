from sqlalchemy.orm import Session

from .models import User


def get_user_by_idp_id(db: Session, idp_id: str) -> User | None:
    """IDP IDでユーザーを取得"""
    return db.query(User).filter(User.idp_id == idp_id).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    """メールアドレスでユーザーを取得"""
    return db.query(User).filter(User.email == email).first()


def create_user(
    db: Session, idp_id: str, email: str, name: str, picture_url: str | None = None
) -> User:
    """新規ユーザーを作成"""
    db_user = User(idp_id=idp_id, email=email, name=name, picture_url=picture_url)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def create_or_update_user(
    db: Session, idp_id: str, email: str, name: str, picture_url: str | None = None
) -> User:
    """ユーザーを作成または更新（upsert）"""
    # 既存ユーザーを検索
    user = get_user_by_idp_id(db, idp_id)

    if user:
        # 既存ユーザーの情報を更新
        user.email = email
        user.name = name
        user.picture_url = picture_url
        db.commit()
        db.refresh(user)
        return user
    else:
        # 新規ユーザーを作成
        return create_user(db, idp_id, email, name, picture_url)

