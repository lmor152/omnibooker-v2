from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from . import models, schemas

# User helpers


def create_user(
    db: Session, user_in: schemas.UserCreate, password_hash: str
) -> models.User:
    user = models.User(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=password_hash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# Provider helpers


def get_providers(db: Session, *, user_id: int) -> list[models.Provider]:
    return (
        db.query(models.Provider)
        .filter(models.Provider.user_id == user_id)
        .order_by(models.Provider.created_at.desc())
        .all()
    )


def get_provider(
    db: Session, *, user_id: int, provider_id: int
) -> Optional[models.Provider]:
    return (
        db.query(models.Provider)
        .filter(models.Provider.user_id == user_id, models.Provider.id == provider_id)
        .first()
    )


def create_provider(
    db: Session, *, user_id: int, provider_in: schemas.ProviderCreate
) -> models.Provider:
    provider = models.Provider(
        user_id=user_id,
        name=provider_in.name,
        type=provider_in.type,
        credentials=provider_in.credentials.model_dump(),
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def update_provider(
    db: Session, provider: models.Provider, provider_in: schemas.ProviderUpdate
) -> models.Provider:
    if provider_in.name is not None:
        provider.name = provider_in.name
    if provider_in.type is not None:
        provider.type = provider_in.type
    if provider_in.credentials is not None:
        provider.credentials = merge_credentials(provider.credentials or {}, provider_in.credentials)
    db.commit()
    db.refresh(provider)
    return provider


def merge_credentials(stored: dict, update: schemas.ProviderCredentialsUpdate) -> dict:
    """Apply an edit to stored credentials. Blank or missing secrets keep the stored value."""

    merged = dict(stored)
    if update.username is not None:
        merged["username"] = update.username
    if update.additionalInfo is not None:
        merged["additionalInfo"] = update.additionalInfo or None
    if update.password:
        merged["password"] = update.password
    if update.removeCard:
        merged["cardDetails"] = None
        merged["cardCvc"] = None
    if update.cardDetails is not None:
        merged["cardDetails"] = update.cardDetails.model_dump()
    if update.cardCvc:
        merged["cardCvc"] = update.cardCvc
    return merged


def delete_provider(db: Session, provider: models.Provider) -> None:
    db.delete(provider)
    db.commit()


# Booking slot helpers


def get_booking_slots(db: Session, *, user_id: int) -> list[models.BookingSlot]:
    return (
        db.query(models.BookingSlot)
        .filter(models.BookingSlot.user_id == user_id)
        .order_by(models.BookingSlot.created_at.desc())
        .all()
    )


def get_booking_slot(
    db: Session, *, user_id: int, slot_id: int
) -> Optional[models.BookingSlot]:
    return (
        db.query(models.BookingSlot)
        .filter(models.BookingSlot.user_id == user_id, models.BookingSlot.id == slot_id)
        .first()
    )


def create_booking_slot(
    db: Session, *, user_id: int, slot_in: schemas.BookingSlotCreate
) -> models.BookingSlot:
    slot = models.BookingSlot(
        user_id=user_id,
        provider_id=slot_in.provider_id,
        name=slot_in.name,
        frequency=slot_in.frequency,
        day_of_week=slot_in.day_of_week,
        day_of_month=slot_in.day_of_month,
    one_off_date=slot_in.one_off_date,
        time=slot_in.time,
        timezone=slot_in.timezone,
        duration_minutes=slot_in.duration_minutes or 60,
        facility=slot_in.facility,
        is_active=slot_in.is_active,
        attempt_strategy=slot_in.attempt_strategy,
        attempt_offset_days=slot_in.attempt_offset_days,
        attempt_offset_hours=slot_in.attempt_offset_hours,
        attempt_offset_minutes=slot_in.attempt_offset_minutes,
        release_days_before=slot_in.release_days_before,
        release_time=slot_in.release_time,
        provider_options=slot_in.provider_options,
        notifications_enabled=slot_in.notifications_enabled,
        notify_destination_id=slot_in.notify_destination_id,
        auto_cancel_enabled=slot_in.auto_cancel_enabled,
        confirm_deadline_hours=slot_in.confirm_deadline_hours,
        reminder_hours=slot_in.reminder_hours,
        confirmation_policy=slot_in.confirmation_policy,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


def update_booking_slot(
    db: Session, slot: models.BookingSlot, slot_in: schemas.BookingSlotUpdate
) -> models.BookingSlot:
    for field, value in slot_in.model_dump(exclude_unset=True).items():
        setattr(slot, field, value)
    db.commit()
    db.refresh(slot)
    return slot


def delete_booking_slot(db: Session, slot: models.BookingSlot) -> None:
    db.delete(slot)
    db.commit()


def cancel_pending_tasks_for_slot(db: Session, slot: models.BookingSlot) -> int:
    """Cancel all pending booking tasks for a slot.

    Returns the number of tasks updated.
    """

    result = (
        db.query(models.BookingTask)
        .filter(
            models.BookingTask.booking_slot_id == slot.id,
            models.BookingTask.status == models.TaskStatusEnum.pending,
        )
        .update(
            {
                "status": models.TaskStatusEnum.cancelled,
                "error_message": "Slot was deactivated",
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return result or 0


# Booking task helpers


def get_booking_tasks(
    db: Session,
    *,
    user_id: int,
    scheduled_from: Optional[datetime] = None,
    scheduled_to: Optional[datetime] = None,
    statuses: Optional[list[models.TaskStatusEnum]] = None,
    slot_id: Optional[int] = None,
) -> list[models.BookingTask]:
    """The user's tasks, oldest first, optionally limited to a scheduled_date range
    (from inclusive, to exclusive), a set of statuses and one session."""

    query = (
        db.query(models.BookingTask)
        .join(models.BookingSlot)
        .filter(models.BookingSlot.user_id == user_id)
    )
    if scheduled_from is not None:
        query = query.filter(models.BookingTask.scheduled_date >= scheduled_from)
    if scheduled_to is not None:
        query = query.filter(models.BookingTask.scheduled_date < scheduled_to)
    if statuses:
        query = query.filter(models.BookingTask.status.in_(statuses))
    if slot_id is not None:
        query = query.filter(models.BookingTask.booking_slot_id == slot_id)
    return query.order_by(models.BookingTask.scheduled_date.asc()).all()


def get_booking_task(
    db: Session, *, user_id: int, task_id: int
) -> Optional[models.BookingTask]:
    return (
        db.query(models.BookingTask)
        .join(models.BookingSlot)
        .filter(models.BookingSlot.user_id == user_id, models.BookingTask.id == task_id)
        .first()
    )


def update_booking_task(
    db: Session, task: models.BookingTask, task_in: schemas.BookingTaskUpdate
) -> models.BookingTask:
    for field, value in task_in.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


def delete_booking_task(db: Session, task: models.BookingTask) -> None:
    db.delete(task)
    db.commit()
