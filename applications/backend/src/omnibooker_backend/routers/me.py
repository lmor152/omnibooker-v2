from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_active_user
from ..services.confirmation import get_preferences

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/preferences", response_model=schemas.UserPreferencesRead)
async def read_preferences(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    prefs = get_preferences(db, current_user.id)
    db.commit()
    return prefs


@router.put("/preferences", response_model=schemas.UserPreferencesRead)
async def update_preferences(
    prefs_in: schemas.UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    prefs = get_preferences(db, current_user.id)
    updates = prefs_in.model_dump(exclude_unset=True)
    destination_id = updates.get("default_destination_id")
    if destination_id is not None:
        destination = db.get(models.ChatDestination, destination_id)
        if destination is None or destination.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown notification channel"
            )
    for field, value in updates.items():
        if field != "confirm_deadline_hours" and field != "default_destination_id" and value is None:
            continue  # only these two may be cleared
        setattr(prefs, field, value)
    db.commit()
    db.refresh(prefs)
    return prefs
