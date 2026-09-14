"""add_user_model_settings

Revision ID: b7f4c1a92d30
Revises: 3580c0dcd005
Create Date: 2026-09-14 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7f4c1a92d30'
down_revision: Union[str, None] = '3580c0dcd005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
    op.create_index(op.f('ix_user_model_settings_user_id'), 'user_model_settings', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_model_settings_user_id'), table_name='user_model_settings')
    op.drop_index(op.f('ix_user_model_settings_id'), table_name='user_model_settings')
    op.drop_table('user_model_settings')
