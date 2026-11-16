from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..security import get_current_active_user
from ..services import confirmation
from ..services.executor import BookingExecutionError, execute_booking_task
from ..services.scheduler import _calculate_attempt_at, sync_pending_tasks

router = APIRouter(prefix="/booking-tasks", tags=["booking-tasks"])


@router.get("/", response_model=list[schemas.BookingTaskRead])
async def list_booking_tasks(
    scheduled_from: datetime | None = Query(
        None, alias="from", description="Only tasks scheduled at or after this time"
    ),
    scheduled_to: datetime | None = Query(
        None, alias="to", description="Only tasks scheduled before this time"
    ),
    status_filter: list[models.TaskStatusEnum] | None = Query(None, alias="status"),
    slot_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return crud.get_booking_tasks(
        db,
        user_id=current_user.id,
        scheduled_from=_as_utc(scheduled_from),
        scheduled_to=_as_utc(scheduled_to),
        statuses=status_filter,
        slot_id=slot_id,
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.get("/{task_id}", response_model=schemas.BookingTaskRead)
async def get_booking_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    task = crud.get_booking_task(db, user_id=current_user.id, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking task not found"
        )
    return task


@router.patch("/{task_id}", response_model=schemas.BookingTaskRead)
async def update_booking_task(
    task_id: int,
    task_in: schemas.BookingTaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    task = crud.get_booking_task(db, user_id=current_user.id, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking task not found"
        )

    if (
        task.status != models.TaskStatusEnum.pending
        and task_in.status == models.TaskStatusEnum.pending
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revert task to pending",
        )

    task = crud.update_booking_task(db, task, task_in)
    return task


@router.post("/{task_id}/cancel", response_model=schemas.BookingTaskRead)
async def cancel_booking_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    task = crud.get_booking_task(db, user_id=current_user.id, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking task not found"
        )

    if task.status != models.TaskStatusEnum.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending tasks can be cancelled",
        )

    task = crud.update_booking_task(
        db, task, schemas.BookingTaskUpdate(status=models.TaskStatusEnum.cancelled)
    )
    slot = task.booking_slot
    if slot and slot.is_active:
        sync_pending_tasks(db, slot, reset_existing=True)
    return task


@router.post("/{task_id}/confirm", response_model=schemas.BookingTaskRead)
async def confirm_booking(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Keep a booking that is awaiting confirmation."""

    _own_task(db, current_user, task_id)
    actor = confirmation.Actor(label="web", user_id=current_user.id)
    return _decide(lambda: confirmation.confirm(db, task_id, actor))


@router.post("/{task_id}/cancel-booking", response_model=schemas.BookingTaskRead)
def cancel_booking_with_provider(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Cancel a made booking with its provider (unlike /cancel, which skips a pending task)."""

    _own_task(db, current_user, task_id)
    actor = confirmation.Actor(label="web", user_id=current_user.id)
    return _decide(lambda: confirmation.request_cancel(db, task_id, actor))


def _own_task(db: Session, user: models.User, task_id: int) -> models.BookingTask:
    task = crud.get_booking_task(db, user_id=user.id, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking task not found"
        )
    return task


def _decide(decision):
    try:
        return decision()
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except confirmation.DecisionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{task_id}/execute", response_model=schemas.BookingTaskRead)
async def execute_task_now(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    task = crud.get_booking_task(db, user_id=current_user.id, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking task not found"
        )

    if task.status != models.TaskStatusEnum.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending tasks can be executed",
        )

    task.status = models.TaskStatusEnum.processing
    task.attempted_at = datetime.now(timezone.utc)
    db.add(task)
    db.commit()

    slot = task.booking_slot
    try:
        task = execute_booking_task(db, task)
    except BookingExecutionError as exc:
        db.rollback()
        task.status = models.TaskStatusEnum.failed
        task.error_message = str(exc)
        db.add(task)
        db.commit()
        confirmation.on_booking_failure(db, task)
        if slot and slot.is_active:
            sync_pending_tasks(db, slot)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Booking failed: {exc}",
        )

    if slot and slot.is_active:
        sync_pending_tasks(db, slot)
    return task


@router.post("/{task_id}/reactivate", response_model=schemas.BookingTaskRead)
async def reactivate_booking_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    task = crud.get_booking_task(db, user_id=current_user.id, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking task not found"
        )

    # Cancelled tasks are "skipped" dates; failed tasks are retried the same way.
    if task.status not in (models.TaskStatusEnum.cancelled, models.TaskStatusEnum.failed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only cancelled or failed tasks can be reactivated",
        )

    # Check if the task is still in the future
    now = datetime.now(timezone.utc)
    if _as_utc(task.scheduled_date) < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reactivate a task scheduled in the past",
        )

    slot = task.booking_slot
    if slot is None or not slot.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume the session before reactivating its tasks",
        )

    # Back to pending with a fresh attempt time. If the booking window has already
    # opened, the attempt is clamped to a minute from now so the worker retries soon.
    task.status = models.TaskStatusEnum.pending
    task.error_message = None
    task.attempted_at = None
    task.attempt_at = _calculate_attempt_at(slot, task.scheduled_date, reference=now)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_booking_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    task = crud.get_booking_task(db, user_id=current_user.id, task_id=task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking task not found"
        )

    # Only allow deletion of cancelled, failed, or successful tasks
    if task.status not in [
        models.TaskStatusEnum.cancelled,
        models.TaskStatusEnum.failed,
        models.TaskStatusEnum.success,
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only cancelled, failed, or completed tasks can be deleted",
        )

    crud.delete_booking_task(db, task)
    return None
