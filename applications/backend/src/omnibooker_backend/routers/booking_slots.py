from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..security import get_current_active_user
from ..services.scheduler import sync_pending_tasks

router = APIRouter(prefix="/booking-slots", tags=["booking-slots"])


@router.get("/", response_model=list[schemas.BookingSlotRead])
async def list_booking_slots(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return crud.get_booking_slots(db, user_id=current_user.id)


@router.post(
    "/", response_model=schemas.BookingSlotRead, status_code=status.HTTP_201_CREATED
)
async def create_booking_slot(
    slot_in: schemas.BookingSlotCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    provider = crud.get_provider(
        db, user_id=current_user.id, provider_id=slot_in.provider_id
    )
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Provider not found"
        )

    slot = crud.create_booking_slot(db, user_id=current_user.id, slot_in=slot_in)
    if slot.is_active:
        sync_pending_tasks(db, slot, reset_existing=True)
    return slot


@router.put("/{slot_id}", response_model=schemas.BookingSlotRead)
async def update_booking_slot(
    slot_id: int,
    slot_in: schemas.BookingSlotUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    slot = crud.get_booking_slot(db, user_id=current_user.id, slot_id=slot_id)
    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking slot not found"
        )

    if slot_in.provider_id and slot_in.provider_id != slot.provider_id:
        provider = crud.get_provider(
            db, user_id=current_user.id, provider_id=slot_in.provider_id
        )
        if not provider:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="New provider not found"
            )

    was_active = slot.is_active
    slot = crud.update_booking_slot(db, slot, slot_in)

    if was_active and not slot.is_active:
        crud.cancel_pending_tasks_for_slot(db, slot)
    elif slot.is_active:
        sync_pending_tasks(db, slot)

    return slot


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_booking_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    slot = crud.get_booking_slot(db, user_id=current_user.id, slot_id=slot_id)
    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking slot not found"
        )
    crud.delete_booking_slot(db, slot)
    return None


@router.post("/{slot_id}/resync", response_model=schemas.BookingSlotRead)
async def resync_booking_tasks(
    slot_id: int,
    count: int = Query(default=6, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    slot = crud.get_booking_slot(db, user_id=current_user.id, slot_id=slot_id)
    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking slot not found"
        )
    sync_pending_tasks(db, slot, count=count, reset_existing=True)
    db.refresh(slot)
    return slot
