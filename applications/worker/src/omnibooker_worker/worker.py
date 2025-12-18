from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from omnibooker_backend import models
from omnibooker_backend.database import SessionLocal
from omnibooker_backend.services.executor import (
    BookingExecutionError,
    execute_booking_task,
)
from omnibooker_backend.services.scheduler import sync_pending_tasks
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from .config import WorkerSettings, get_worker_settings

logger = logging.getLogger(__name__)


class BookingTaskWorker:
    """Polls the database for due booking tasks and executes them."""

    def __init__(self, settings: WorkerSettings | None = None):
        self.settings = settings or get_worker_settings()

    def run_forever(self) -> None:
        logger.info(
            "Starting worker (poll interval: %.1fs, batch size: %s)",
            self.settings.poll_interval_seconds,
            self.settings.batch_size,
        )
        try:
            while True:
                processed = self.run_once()
                if processed == 0:
                    time.sleep(self.settings.poll_interval_seconds)
        except KeyboardInterrupt:
            logger.info("Worker interrupted. Shutting down.")

    def run_once(self) -> int:
        with SessionLocal() as session:
            return self._process_due_tasks(session)

    def _process_due_tasks(self, db: Session) -> int:
        now = datetime.now(timezone.utc)
        tasks = (
            db.query(models.BookingTask)
            .options(
                selectinload(models.BookingTask.booking_slot).selectinload(
                    models.BookingSlot.provider
                ),
                selectinload(models.BookingTask.booking_slot).selectinload(
                    models.BookingSlot.owner
                ),
            )
            .filter(models.BookingTask.status == models.TaskStatusEnum.pending)
            .filter(
                or_(
                    models.BookingTask.attempt_at <= now,
                    models.BookingTask.attempt_at.is_(None),
                )
            )
            .order_by(models.BookingTask.attempt_at.asc())
            .limit(self.settings.batch_size)
            .all()
        )

        if not tasks:
            return 0

        processed = 0
        for task in tasks:
            processed += self._process_task(db, task)
        return processed

    def _process_task(self, db: Session, task: models.BookingTask) -> int:
        slot = getattr(task, "booking_slot", None)
        if slot is None:
            logger.warning("Task %s has no associated slot; marking failed", task.id)
            task.status = models.TaskStatusEnum.failed
            task.error_message = "Associated booking slot missing"
            db.add(task)
            db.commit()
            return 0

        if task.attempt_at is None:
            task.attempt_at = task.scheduled_date
            db.add(task)
            db.commit()

        if not slot.is_active:
            logger.info(
                "Skipping task %s because slot %s is inactive", task.id, slot.id
            )
            task.status = models.TaskStatusEnum.cancelled
            task.error_message = "Slot deactivated before execution"
            db.add(task)
            db.commit()
            return 0

        task.status = models.TaskStatusEnum.processing
        task.attempted_at = datetime.now(timezone.utc)
        db.add(task)
        db.commit()

        try:
            execute_booking_task(db, task)
            sync_pending_tasks(db, slot)
            logger.info("Task %s executed successfully for slot %s", task.id, slot.id)
            return 1
        except BookingExecutionError as exc:
            logger.warning("Task %s failed during provider booking: %s", task.id, exc)
            _mark_failed(db, task, str(exc))
            if slot.is_active:
                sync_pending_tasks(db, slot)
            return 0
        except Exception as exc:  # pragma: no cover - unexpected failure path
            logger.exception("Task %s failed unexpectedly: %s", task.id, exc)
            _mark_failed(db, task, str(exc))
            if slot.is_active:
                sync_pending_tasks(db, slot)
            return 0


def _mark_failed(db: Session, task: models.BookingTask, message: str) -> None:
    db.rollback()
    task.status = models.TaskStatusEnum.failed
    task.error_message = message
    db.add(task)
    db.commit()
