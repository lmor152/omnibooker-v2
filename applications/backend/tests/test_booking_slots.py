from uuid import uuid4

from omnibooker_backend import crud, models, schemas  # type: ignore[import-not-found]
from sqlalchemy.orm import Session


def _create_user(db: Session) -> models.User:
    user = models.User(
        email=f"user-{uuid4()}@example.com",
        full_name="Test User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_provider(db: Session, user: models.User) -> models.Provider:
    provider = models.Provider(
        user_id=user.id,
        name="ClubSpark",
        type="clubspark",
        credentials={"username": "demo", "password": "secret"},
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def test_create_booking_slot_preserves_timezone(db_session: Session) -> None:
    user = _create_user(db_session)
    provider = _create_provider(db_session, user)

    slot_in = schemas.BookingSlotCreate(
        name="Morning Tennis",
        provider_id=provider.id,
        frequency=models.FrequencyEnum.weekly,
        day_of_week=1,
        day_of_month=None,
        time="08:00",
        timezone="America/New_York",
    )

    slot = crud.create_booking_slot(db_session, user_id=user.id, slot_in=slot_in)

    assert slot.timezone == "America/New_York"
