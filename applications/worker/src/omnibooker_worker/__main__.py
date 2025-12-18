import argparse
import logging
import sys

from .config import get_worker_settings
from .worker import BookingTaskWorker


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Omnibooker background worker")
    parser.add_argument(
        "--once", action="store_true", help="Process a single batch then exit"
    )
    parser.add_argument(
        "--log-level", default="INFO", help="Logging level (default: INFO)"
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    configure_logging(args.log_level)

    settings = get_worker_settings()
    worker = BookingTaskWorker(settings=settings)

    if args.once:
        processed = worker.run_once()
        logging.getLogger(__name__).info("Processed %s tasks", processed)
        return 0

    worker.run_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
