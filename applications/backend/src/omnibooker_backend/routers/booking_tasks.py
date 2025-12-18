from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..security import get_current_active_user
from ..services.executor import BookingExecutionError, execute_booking_task
from ..services.scheduler import sync_pending_tasks

router = APIRouter(prefix="/booking-tasks", tags=["booking-tasks"])


@router.get("/", response_model=list[schemas.BookingTaskRead])
async def list_booking_tasks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return crud.get_booking_tasks(db, user_id=current_user.id)


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
        sync_pending_tasks(db, slot)
    return task


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

    if task.status != models.TaskStatusEnum.cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only cancelled tasks can be reactivated",
        )

    # Check if the task is still in the future
    now = datetime.now(timezone.utc)
    scheduled = (
        task.scheduled_date.replace(tzinfo=timezone.utc)
        if task.scheduled_date.tzinfo is None
        else task.scheduled_date
    )
    if scheduled < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reactivate a task scheduled in the past",
        )

    # Reactivate the task
    task.status = models.TaskStatusEnum.pending
    task.error_message = None
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
