"""model_profiles

Revision ID: d4f8b2c605ae
Revises: c1a4e7d90b52
Create Date: 2026-09-14 15:20:00.000000

把「用户级单条模型配置」升级为「多套模型配置（profile）+ 一键切换」：

- 新表 model_profiles：一个用户可保存多套配置，至多一条 is_active=1；
- 旧表 user_model_settings 的每一行搬成一条名为「默认配置」的激活配置，
  api_key 是 Fernet 密文，原样搬运，用户无需重新输入 Key；
- 搬迁后删除旧表。

downgrade 会把每个用户「激活的那条（没有激活的取最早一条）」写回旧表。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f8b2c605ae'
down_revision: Union[str, None] = 'c1a4e7d90b52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'model_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False, server_default='deepseek'),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('api_base', sa.String(length=255), nullable=True),
        sa.Column('api_key', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='uq_model_profiles_user_name'),
    )
    op.create_index(op.f('ix_model_profiles_id'), 'model_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_model_profiles_user_id'), 'model_profiles', ['user_id'], unique=False)
    op.create_index('ix_model_profiles_user_active', 'model_profiles', ['user_id', 'is_active'], unique=False)

    # 旧配置搬迁：密文原样搬运，统一命名「默认配置」并置为激活
    op.execute(
        """
        INSERT INTO model_profiles
            (user_id, name, provider, model, api_base, api_key, is_active, created_at, updated_at)
        SELECT
            user_id, '默认配置', chat_provider, chat_model, chat_api_base, chat_api_key, 1,
            created_at, updated_at
        FROM user_model_settings
        """
    )

    op.drop_table('user_model_settings')


def downgrade() -> None:
    op.create_table(
        'user_model_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('chat_provider', sa.String(length=50), nullable=False, server_default='deepseek'),
        sa.Column('chat_api_key', sa.Text(), nullable=True),
        sa.Column('chat_api_base', sa.String(length=255), nullable=True),
        sa.Column('chat_model', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )
    op.create_index(op.f('ix_user_model_settings_id'), 'user_model_settings', ['id'], unique=False)
    op.create_index(
        op.f('ix_user_model_settings_user_id'), 'user_model_settings', ['user_id'], unique=True
    )

    # 反向回填：每个用户取「激活的优先、否则最早的一条」
    op.execute(
        """
        INSERT INTO user_model_settings
            (user_id, chat_provider, chat_api_key, chat_api_base, chat_model, created_at, updated_at)
        SELECT p.user_id, p.provider, p.api_key, p.api_base, p.model, p.created_at, p.updated_at
        FROM model_profiles p
        WHERE p.id = (
            SELECT p2.id
            FROM model_profiles p2
            WHERE p2.user_id = p.user_id
            ORDER BY p2.is_active DESC, p2.id ASC
            LIMIT 1
        )
        """
    )

    op.drop_table('model_profiles')
