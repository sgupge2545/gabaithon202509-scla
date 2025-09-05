"""
SQLiteスキーマ初期化スクリプト
指定されたスキーマに基づいてテーブルを作成します。
"""
from sqlalchemy import text

from .database import Base, engine
from .models import Message, Room, RoomMember, User


def init_schema():
    """データベーススキーマを初期化"""
    print("データベーススキーマを初期化中...")

    # 既存のテーブルを削除（開発時のみ）
    Base.metadata.drop_all(bind=engine)

    # 新しいスキーマでテーブルを作成
    Base.metadata.create_all(bind=engine)

    # 外部キー制約が有効になっていることを確認
    with engine.connect() as connection:
        result = connection.execute(text("PRAGMA foreign_keys"))
        fk_status = result.fetchone()[0]
        print(f"外部キー制約: {'有効' if fk_status == 1 else '無効'}")

    print("スキーマ初期化完了!")
    print("\n作成されたテーブル:")
    print("- users (ユーザー)")
    print("- rooms (ルーム)")
    print("- room_members (ルームメンバー)")
    print("- messages (メッセージ)")


if __name__ == "__main__":
    init_schema()
