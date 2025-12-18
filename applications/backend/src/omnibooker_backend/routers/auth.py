from fastapi import APIRouter, Depends

from .. import models, schemas
from ..security import get_current_active_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=schemas.UserRead)
async def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    return current_user
