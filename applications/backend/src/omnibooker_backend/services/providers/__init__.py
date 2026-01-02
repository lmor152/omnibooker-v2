"""Provider-specific booking handlers.

Add your provider modules here and register them with the booking engine.
For example:

    from ..booking_engine import BookingResult, register_provider_handler

    def my_provider_handler(context):
        # interact with provider API
        return BookingResult(success=True, confirmation_code="ABC123")

    register_provider_handler("clubspark", my_provider_handler)

This file is imported automatically when the booking executor runs so any
registrations performed at import time will be available to the worker.
"""

from importlib import import_module

import_module(f"{__name__}.clubspark")
import_module(f"{__name__}.better")
