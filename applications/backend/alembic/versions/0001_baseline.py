"""baseline: schema as it existed before Alembic was introduced

Revision ID: 0001
Revises: 

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=True),
    sa.Column('full_name', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_id'), ['id'], unique=False)

    op.create_table('providers',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('type', sa.String(length=50), nullable=False),
    sa.Column('credentials', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('providers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_providers_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_providers_user_id'), ['user_id'], unique=False)

    op.create_table('booking_slots',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('provider_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('frequency', sa.Enum('weekly', 'fortnightly', 'monthly', 'one_off', name='frequencyenum'), nullable=False),
    sa.Column('day_of_week', sa.Integer(), nullable=True),
    sa.Column('day_of_month', sa.Integer(), nullable=True),
    sa.Column('one_off_date', sa.Date(), nullable=True),
    sa.Column('time', sa.String(length=5), nullable=False),
    sa.Column('timezone', sa.String(length=50), server_default='UTC', nullable=False),
    sa.Column('duration_minutes', sa.Integer(), nullable=True),
    sa.Column('facility', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('attempt_strategy', sa.Enum('offset', 'release', name='attemptstrategyenum'), nullable=False),
    sa.Column('attempt_offset_days', sa.Integer(), nullable=False),
    sa.Column('attempt_offset_hours', sa.Integer(), nullable=False),
    sa.Column('attempt_offset_minutes', sa.Integer(), nullable=False),
    sa.Column('release_days_before', sa.Integer(), nullable=False),
    sa.Column('release_time', sa.String(length=5), nullable=True),
    sa.Column('provider_options', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['provider_id'], ['providers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('booking_slots', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_booking_slots_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_booking_slots_provider_id'), ['provider_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_booking_slots_user_id'), ['user_id'], unique=False)

    op.create_table('booking_tasks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('booking_slot_id', sa.Integer(), nullable=False),
    sa.Column('scheduled_date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('status', sa.Enum('pending', 'processing', 'success', 'failed', 'cancelled', name='taskstatusenum'), nullable=False),
    sa.Column('attempt_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('booked_time', sa.String(length=5), nullable=True),
    sa.Column('booked_resource', sa.String(length=255), nullable=True),
    sa.Column('confirmation_code', sa.String(length=255), nullable=True),
    sa.Column('attempted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['booking_slot_id'], ['booking_slots.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('booking_tasks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_booking_tasks_booking_slot_id'), ['booking_slot_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_booking_tasks_id'), ['id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('booking_tasks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_booking_tasks_id'))
        batch_op.drop_index(batch_op.f('ix_booking_tasks_booking_slot_id'))

    op.drop_table('booking_tasks')
    with op.batch_alter_table('booking_slots', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_booking_slots_user_id'))
        batch_op.drop_index(batch_op.f('ix_booking_slots_provider_id'))
        batch_op.drop_index(batch_op.f('ix_booking_slots_id'))

    op.drop_table('booking_slots')
    with op.batch_alter_table('providers', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_providers_user_id'))
        batch_op.drop_index(batch_op.f('ix_providers_id'))

    op.drop_table('providers')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_id'))
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
