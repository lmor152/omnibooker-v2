from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..security import get_current_active_user
from ..services import push

router = APIRouter(prefix="/push", tags=["push"])

MAX_DEVICES_PER_USER = 20


@router.get("/config", response_model=schemas.PushConfigRead)
async def push_config():
    settings = get_settings()
    return schemas.PushConfigRead(public_key=settings.vapid_public_key if push.is_configured() else None)


@router.get("/subscriptions", response_model=list[schemas.PushSubscriptionRead])
async def list_subscriptions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return (
        db.query(models.PushSubscription)
        .filter_by(user_id=current_user.id)
        .order_by(models.PushSubscription.created_at)
        .all()
    )


@router.post("/subscriptions", response_model=schemas.PushSubscriptionRead)
async def save_subscription(
    payload: schemas.PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Register this device for notifications. Re-subscribing the same device updates it in place."""

    if not push.is_allowed_endpoint(payload.endpoint):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported push service")
    subscription = db.query(models.PushSubscription).filter_by(endpoint=payload.endpoint).first()
    if subscription is None:
        count = db.query(models.PushSubscription).filter_by(user_id=current_user.id).count()
        if count >= MAX_DEVICES_PER_USER:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"You can have up to {MAX_DEVICES_PER_USER} devices; remove one first",
            )
        subscription = models.PushSubscription(endpoint=payload.endpoint)
        db.add(subscription)
    elif subscription.user_id != current_user.id and subscription.auth != payload.keys.auth:
        # Moving a device to another account (logging in as someone else on it) needs the device's
        # own secret, which only that browser has; knowing the endpoint URL isn't enough.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This device is registered to another account")
    subscription.user_id = current_user.id
    subscription.p256dh = payload.keys.p256dh
    subscription.auth = payload.keys.auth
    subscription.user_agent = payload.user_agent
    db.commit()
    db.refresh(subscription)
    return subscription


@router.post("/subscriptions/remove", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subscription_by_endpoint(
    payload: schemas.PushSubscriptionRemove,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Turn notifications off for this device (identified by its endpoint)."""

    db.query(models.PushSubscription).filter_by(
        user_id=current_user.id, endpoint=payload.endpoint
    ).delete()
    db.commit()


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    subscription = db.get(models.PushSubscription, subscription_id)
    if subscription is None or subscription.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    db.delete(subscription)
    db.commit()


@router.post("/test", response_model=schemas.PushTestResult)
def send_test(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if not push.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications aren't set up on the server",
        )
    sent = push.send_to_user(
        db,
        current_user.id,
        push.PushMessage(
            title="Bookie Monster",
            body="Notifications are working. You'll hear about bookings here.",
            url="/#/settings",
            tag="test",
        ),
    )
    db.commit()
    return schemas.PushTestResult(sent=sent)
