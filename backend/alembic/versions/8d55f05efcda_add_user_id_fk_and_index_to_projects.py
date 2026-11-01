"""add_user_id_fk_and_index_to_projects

Revision ID: 8d55f05efcda
Revises: b19b65e60139
Create Date: 2026-11-02 00:35:12.483192

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d55f05efcda'
down_revision: Union[str, Sequence[str], None] = 'b19b65e60139'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely across SQLite and PostgreSQL."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = [idx.get('name') for idx in inspector.get_indexes('projects')]
    cols = [col.get('name') for col in inspector.get_columns('projects')]

    if bind.dialect.name == "sqlite":
        # SQLite: only add column if absent, avoiding unnecessary table recreation
        if 'user_id' not in cols:
            with op.batch_alter_table('projects', schema=None) as batch_op:
                batch_op.add_column(sa.Column('user_id', sa.String(length=36), nullable=True))
                batch_op.create_index(batch_op.f('ix_projects_user_id'), ['user_id'], unique=False)
                batch_op.create_foreign_key('fk_projects_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    else:
        # PostgreSQL / Production RDBMS: native DDL
        if 'user_id' not in cols:
            op.add_column('projects', sa.Column('user_id', sa.String(length=36), nullable=True))
        if 'ix_projects_user_id' not in indexes:
            op.create_index('ix_projects_user_id', 'projects', ['user_id'], unique=False)
        op.create_foreign_key('fk_projects_user_id', 'projects', 'users', ['user_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table('projects', schema=None) as batch_op:
            batch_op.drop_constraint('fk_projects_user_id', type_='foreignkey')
            batch_op.drop_index('ix_projects_user_id')
    else:
        op.drop_constraint('fk_projects_user_id', 'projects', type_='foreignkey')
        op.drop_index('ix_projects_user_id', table_name='projects')
