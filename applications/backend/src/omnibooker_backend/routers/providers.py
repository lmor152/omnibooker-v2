from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..integrations.better.client import BetterAPIError, BetterClient
from ..integrations.clubspark.client import ClubsparkAPIError, ClubsparkClient
from ..security import get_current_active_user

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/", response_model=list[schemas.ProviderRead])
async def list_providers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return crud.get_providers(db, user_id=current_user.id)


@router.post(
    "/", response_model=schemas.ProviderRead, status_code=status.HTTP_201_CREATED
)
async def create_provider(
    provider_in: schemas.ProviderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    return crud.create_provider(db, user_id=current_user.id, provider_in=provider_in)


@router.put("/{provider_id}", response_model=schemas.ProviderRead)
async def update_provider(
    provider_id: int,
    provider_in: schemas.ProviderUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    provider = crud.get_provider(db, user_id=current_user.id, provider_id=provider_id)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found"
        )
    return crud.update_provider(db, provider, provider_in)


@router.post("/test", response_model=schemas.ProviderTestResult)
async def test_provider_credentials(
    test_in: schemas.ProviderTestRequest,
    current_user: models.User = Depends(get_current_active_user),
):
    username = test_in.credentials.username
    password = test_in.credentials.password

    if test_in.type == "Better":
        try:
            with BetterClient(username, password) as client:
                client._authenticate()
            return schemas.ProviderTestResult(success=True, message="Successfully authenticated with Better")
        except BetterAPIError as exc:
            return schemas.ProviderTestResult(success=False, message=str(exc))
        except Exception as exc:
            return schemas.ProviderTestResult(success=False, message=f"Unexpected error: {exc}")

    elif test_in.type == "Clubspark":
        try:
            with ClubsparkClient(username, password) as client:
                client._fetch_token()
            return schemas.ProviderTestResult(success=True, message="Successfully authenticated with Clubspark")
        except ClubsparkAPIError as exc:
            return schemas.ProviderTestResult(success=False, message=str(exc))
        except Exception as exc:
            return schemas.ProviderTestResult(success=False, message=f"Unexpected error: {exc}")

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credential testing is not supported for this provider type",
        )


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    provider = crud.get_provider(db, user_id=current_user.id, provider_id=provider_id)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found"
        )
    crud.delete_provider(db, provider)
    return None
