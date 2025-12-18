"""Typed responses for the ClubSpark API."""

from __future__ import annotations

from pydantic import BaseModel


class AppSettingResource(BaseModel):
    ID: str
    Name: str
    Number: int
    Surface: int
    Category: int
    ResourceGroupID: str
    ResourceGroupIDs: list[str]


class AppSettingResourceGroup(BaseModel):
    ID: str
    Name: str
    SortOrder: int
    HideResourceProperties: bool


class AppSettingResourceAttribute(BaseModel):
    ID: int
    Name: str


class AppSettingVenue(BaseModel):
    ID: str
    Name: str
    UrlSegment: str
    TimeZone: str
    CurrencyCode: str
    OpeningTime: int
    ClosingTime: int
    Interval: int
    MaximumBookingIntervals: int
    MinimumBookingIntervals: int
    MaximumBookings: int
    AdvancedBookingPeriod: int
    BookingRefundWindow: int
    BookingPaymentEnabled: bool
    GroupBookingEnabled: bool
    IsMember: bool
    Latitude: float
    Longitude: float
    StripePublishableKey: str
    StripeAccountID: str
    Features: int
    Resources: list[AppSettingResource]
    ClosedDates: list[str]
    AccessControl: int
    ResourceGroups: list[AppSettingResourceGroup]
    ResourceCategories: list[AppSettingResourceAttribute]
    ResourceSurfaces: list[AppSettingResourceAttribute]
    ResourceFormats: list[AppSettingResourceAttribute]
    ResourceLightings: list[AppSettingResourceAttribute]
    ResourceLocations: list[AppSettingResourceAttribute]
    ResourceSizes: list[AppSettingResourceAttribute]
    DiscountsEnabled: bool


class AppSettingsResponse(BaseModel):
    Venue: AppSettingVenue
    StripePublishableKey: str
    AgreedTerms: bool


class ResourceSlot(BaseModel):
    ID: str
    Category: int
    SessionID: str
    Cost: float
    CourtCost: float
    LightingCost: float
    MemberPrice: float
    GuestPrice: float
    Capacity: int
    Name: str
    LocationDescription: str
    SurfaceDescription: str
    CategoryDescription: str


class TimeSlot(BaseModel):
    Time: int
    Resources: list[ResourceSlot]


class GetAvailabilityTimesResponse(BaseModel):
    Result: int
    SessionID: str
    Times: list[TimeSlot]


class GetVenueCreditResponse(BaseModel):
    amount: float


class CreatePaymentResponse(BaseModel):
    RequiresAction: bool | None
    ID: str | None
    ExternalID: str | None
    Status: str | None
    Error: str | None
    PaymentIntentClientSecret: str | None


class RequestSessionResponse(BaseModel):
    Result: int
    ResourceID: str
    SessionID: str
    TimeZone: str
    Attended: bool
    TransactionID: str
    HardwareIntegrationPIN: str


class GetUserVenuesResponse(BaseModel):
    class Venue(BaseModel):
        ID: str
        Name: str
        UrlSegment: str

    Venues: list[Venue]


class VenueContact(BaseModel):
    VenueID: str
    VenueContactID: str
    ParentRegionID: str
    RegionID: str
    PrivatePIN: str
    VenueSystemRoles: int
    VenueName: str
    VenueUrlSegment: str
    VenueTimeZoneID: str
    VenueIsoTimeZone: str
    CreatedDateTime: str


class GetCurrentUserResponse(BaseModel):
    ID: str
    ExternalID: str
    FirstName: str
    LastName: str
    EmailAddress: str
    VenueContacts: list[VenueContact]
