"""booking confirmations, chat destinations and scheduled actions

Revision ID: 0003
Revises: 0002

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('chat_destinations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('platform', sa.String(length=32), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('discord_guild_id', sa.String(length=64), nullable=True),
    sa.Column('discord_channel_id', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_destinations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_destinations_user_id'), ['user_id'], unique=False)

    op.create_table('chat_identities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('platform', sa.String(length=32), nullable=False),
    sa.Column('external_user_id', sa.String(length=64), nullable=False),
    sa.Column('external_username', sa.String(length=255), nullable=True),
    sa.Column('linked_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('platform', 'external_user_id')
    )
    with op.batch_alter_table('chat_identities', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_identities_user_id'), ['user_id'], unique=False)

    op.create_table('chat_link_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code_hash')
    )
    with op.batch_alter_table('chat_link_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_link_codes_user_id'), ['user_id'], unique=False)

    op.create_table('user_preferences',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('notifications_enabled', sa.Boolean(), nullable=False),
    sa.Column('auto_cancel_default', sa.Boolean(), nullable=False),
    sa.Column('confirm_deadline_hours', sa.Integer(), nullable=True),
    sa.Column('refund_buffer_hours', sa.Integer(), nullable=False),
    sa.Column('reminder_hours', sa.JSON(), nullable=False),
    sa.Column('short_notice_min_hours', sa.Integer(), nullable=False),
    sa.Column('default_destination_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['default_destination_id'], ['chat_destinations.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('chat_messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('booking_task_id', sa.Integer(), nullable=True),
    sa.Column('destination_id', sa.Integer(), nullable=True),
    sa.Column('platform', sa.String(length=32), nullable=False),
    sa.Column('channel_id', sa.String(length=64), nullable=False),
    sa.Column('message_id', sa.String(length=64), nullable=False),
    sa.Column('purpose', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['booking_task_id'], ['booking_tasks.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['destination_id'], ['chat_destinations.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_messages_booking_task_id'), ['booking_task_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_chat_messages_message_id'), ['message_id'], unique=False)

    op.create_table('scheduled_actions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('booking_task_id', sa.Integer(), nullable=True),
    sa.Column('kind', sa.String(length=32), nullable=False),
    sa.Column('due_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('status', sa.Enum('pending', 'done', 'skipped', 'failed', name='actionstatusenum', native_enum=False, length=32), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('last_error', sa.Text(), nullable=True),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.Column('dedupe_key', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['booking_task_id'], ['booking_tasks.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedupe_key')
    )
    with op.batch_alter_table('scheduled_actions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_scheduled_actions_booking_task_id'), ['booking_task_id'], unique=False)
        batch_op.create_index('ix_scheduled_actions_status_due', ['status', 'due_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_scheduled_actions_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('booking_slots', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notifications_enabled', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('notify_destination_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('auto_cancel_enabled', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('confirm_deadline_hours', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('reminder_hours', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('confirmation_policy', sa.Enum('owner_only', 'anyone', 'quorum', name='confirmationpolicyenum', native_enum=False, length=32), server_default='owner_only', nullable=False))
        batch_op.create_foreign_key('fk_booking_slots_notify_destination_id', 'chat_destinations', ['notify_destination_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('booking_tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('confirmation_status', sa.Enum('not_required', 'awaiting', 'confirmed', 'auto_kept', 'cancel_pending', 'cancelled', 'cancel_failed', 'manual_cancel_required', name='confirmationstatusenum', native_enum=False, length=32), server_default='not_required', nullable=False))
        batch_op.add_column(sa.Column('confirm_deadline_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('refund_deadline_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('confirmed_by', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('cancel_requested_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('cancel_message', sa.Text(), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('booking_tasks', schema=None) as batch_op:
        batch_op.drop_column('cancel_message')
        batch_op.drop_column('cancelled_at')
        batch_op.drop_column('cancel_requested_at')
        batch_op.drop_column('confirmed_by')
        batch_op.drop_column('confirmed_at')
        batch_op.drop_column('refund_deadline_at')
        batch_op.drop_column('confirm_deadline_at')
        batch_op.drop_column('confirmation_status')

    with op.batch_alter_table('booking_slots', schema=None) as batch_op:
        # WARNING: constraint name is None; this directive will fail as
        # rendered.  Add a name, or use a naming convention; see
        # https://alembic.sqlalchemy.org/en/latest/naming.html
        batch_op.drop_constraint('fk_booking_slots_notify_destination_id', type_='foreignkey')
        batch_op.drop_column('confirmation_policy')
        batch_op.drop_column('reminder_hours')
        batch_op.drop_column('confirm_deadline_hours')
        batch_op.drop_column('auto_cancel_enabled')
        batch_op.drop_column('notify_destination_id')
        batch_op.drop_column('notifications_enabled')

    with op.batch_alter_table('scheduled_actions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_scheduled_actions_user_id'))
        batch_op.drop_index('ix_scheduled_actions_status_due')
        batch_op.drop_index(batch_op.f('ix_scheduled_actions_booking_task_id'))

    op.drop_table('scheduled_actions')
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_messages_message_id'))
        batch_op.drop_index(batch_op.f('ix_chat_messages_booking_task_id'))

    op.drop_table('chat_messages')
    op.drop_table('user_preferences')
    with op.batch_alter_table('chat_link_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_link_codes_user_id'))

    op.drop_table('chat_link_codes')
    with op.batch_alter_table('chat_identities', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_identities_user_id'))

    op.drop_table('chat_identities')
    with op.batch_alter_table('chat_destinations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_destinations_user_id'))

    op.drop_table('chat_destinations')
