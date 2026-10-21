"""store provider booking identifiers and cost on booking tasks

Revision ID: 0002
Revises: 0001

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('booking_tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider_booking_ref', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('cost', sa.Numeric(precision=10, scale=2), nullable=True))
        batch_op.add_column(sa.Column('currency', sa.String(length=3), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('booking_tasks', schema=None) as batch_op:
        batch_op.drop_column('currency')
        batch_op.drop_column('cost')
        batch_op.drop_column('provider_booking_ref')
