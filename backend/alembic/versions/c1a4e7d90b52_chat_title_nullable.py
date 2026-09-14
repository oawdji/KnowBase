"""chat_title_nullable

Revision ID: c1a4e7d90b52
Revises: b7f4c1a92d30
Create Date: 2026-09-14 14:05:00.000000

对话标题改为可空：NULL 表示「系统还没自动命名、用户也没命名」，
前端显示占位名「新对话」；首条用户消息落库后由后端自动命名，用户也可随时手动改名。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a4e7d90b52'
down_revision: Union[str, None] = 'b7f4c1a92d30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'chats',
        'title',
        existing_type=sa.String(length=255),
        nullable=True,
        existing_nullable=False,
    )


def downgrade() -> None:
    # 回滚前先把 NULL 标题补成占位名，否则无法加回 NOT NULL 约束
    op.execute("UPDATE chats SET title = '新对话' WHERE title IS NULL")
    op.alter_column(
        'chats',
        'title',
        existing_type=sa.String(length=255),
        nullable=False,
        existing_nullable=True,
    )
