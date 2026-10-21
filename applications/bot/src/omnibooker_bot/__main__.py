import logging
import os
import sys

from omnibooker_backend.config import get_settings

from .bot import BookieBot


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    token = get_settings().discord_bot_token
    if not token:
        logging.error("DISCORD_BOT_TOKEN is not set")
        return 1
    # Optional: sync slash commands to one server instantly (global sync can lag).
    dev_guild = os.environ.get("DISCORD_DEV_GUILD_ID")
    BookieBot(dev_guild_id=int(dev_guild) if dev_guild else None).run(token, log_handler=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
