"""encrypt provider credentials at rest

Provider credentials (passwords, card details) move from a plain JSON column to Fernet-encrypted
text. Existing rows are encrypted here, so OMNIBOOKER_ENCRYPTION_KEY must be set when this runs
against a database that has providers. Back up the database first.

Revision ID: 0005
Revises: 0004

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('providers', schema=None) as batch_op:
        batch_op.alter_column(
            'credentials',
            existing_type=sa.JSON(),
            type_=sa.Text(),
            existing_nullable=False,
            postgresql_using='credentials::text',
        )

    from omnibooker_backend.crypto import encrypt_str, is_encrypted

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, credentials FROM providers")).fetchall()
    for provider_id, value in rows:
        if value is None or is_encrypted(value):
            continue
        # Raises EncryptionNotConfiguredError (aborting the migration) if no key is set.
        connection.execute(
            sa.text("UPDATE providers SET credentials = :value WHERE id = :id"),
            {"value": encrypt_str(value), "id": provider_id},
        )


def downgrade() -> None:
    from omnibooker_backend.crypto import decrypt_str, is_encrypted

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, credentials FROM providers")).fetchall()
    for provider_id, value in rows:
        if value is not None and is_encrypted(value):
            connection.execute(
                sa.text("UPDATE providers SET credentials = :value WHERE id = :id"),
                {"value": decrypt_str(value), "id": provider_id},
            )

    with op.batch_alter_table('providers', schema=None) as batch_op:
        batch_op.alter_column(
            'credentials',
            existing_type=sa.Text(),
            type_=sa.JSON(),
            existing_nullable=False,
            postgresql_using='credentials::json',
        )
