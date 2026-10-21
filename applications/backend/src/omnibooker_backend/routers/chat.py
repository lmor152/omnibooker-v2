from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..security import get_current_active_user
from ..services import chat_links
from ..services.chat.base import ChatError, OutgoingMessage
from ..services.chat.discord import DiscordClient

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/discord/link-code", response_model=schemas.ChatLinkCodeRead)
async def create_discord_link_code(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    code, expires_at = chat_links.create_link_code(db, current_user.id)
    application_id = get_settings().discord_application_id
    return schemas.ChatLinkCodeRead(
        code=code,
        expires_at=expires_at,
        bot_invite_url=chat_links.bot_invite_url(application_id) if application_id else None,
    )


@router.get("/identities", response_model=list[schemas.ChatIdentityRead])
async def list_identities(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return db.query(models.ChatIdentity).filter_by(user_id=current_user.id).all()


@router.delete("/identities/{identity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_identity(
    identity_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    identity = db.get(models.ChatIdentity, identity_id)
    if identity is None or identity.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    db.delete(identity)
    db.commit()


@router.get("/destinations", response_model=list[schemas.ChatDestinationRead])
async def list_destinations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return (
        db.query(models.ChatDestination)
        .filter_by(user_id=current_user.id)
        .order_by(models.ChatDestination.created_at)
        .all()
    )


@router.delete("/destinations/{destination_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_destination(
    destination_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    destination = _own_destination(db, current_user, destination_id)
    db.delete(destination)
    db.commit()


@router.post("/destinations/{destination_id}/test", status_code=status.HTTP_204_NO_CONTENT)
async def test_destination(
    destination_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    destination = _own_destination(db, current_user, destination_id)
    token = get_settings().discord_bot_token
    if not token or not destination.discord_channel_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Discord is not set up")
    try:
        with DiscordClient(token) as client:
            client.send(
                destination.discord_channel_id,
                OutgoingMessage("👋 Bookie Monster can post booking updates here."),
            )
    except ChatError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


def _own_destination(
    db: Session, user: models.User, destination_id: int
) -> models.ChatDestination:
    destination = db.get(models.ChatDestination, destination_id)
    if destination is None or destination.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return destination
