"""Discord bot: account linking, Keep/Cancel buttons, ✅ reactions.

Posting notifications is done by the worker over Discord's REST API; this process
handles everything users send back. All database and provider work runs in a
thread so the gateway connection never blocks.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable, TypeVar

import discord
from discord import app_commands

from omnibooker_backend import models
from omnibooker_backend.database import SessionLocal
from omnibooker_backend.services import chat_links, confirmation
from omnibooker_backend.services.chat import render

logger = logging.getLogger(__name__)

T = TypeVar("T")
CONFIRM_EMOJI = "✅"


async def in_db(fn: Callable[..., T], *args) -> T:
    """Run fn(db, *args) in a worker thread with its own session."""

    def call() -> T:
        with SessionLocal() as db:
            return fn(db, *args)

    return await asyncio.to_thread(call)


def _actor(db, discord_user: discord.abc.User) -> confirmation.Actor:
    identity = chat_links.identity_for(db, chat_links.DISCORD, str(discord_user.id))
    return confirmation.Actor(
        label=f"discord:{discord_user.id}", user_id=identity.user_id if identity else None
    )


def _decide(db, decision: str, task_id: int, discord_user: discord.abc.User) -> str:
    actor = _actor(db, discord_user)
    if actor.user_id is None:
        return "Link your account first: run `/bookie link` with a code from the app's Settings page."
    try:
        if decision == "keep":
            task = confirmation.confirm(db, task_id, actor)
            return f"✅ Kept **{render.short_id(task)}**."
        task = confirmation.request_cancel(db, task_id, actor)
        return render.cancel_result_message(task).content
    except (PermissionError, confirmation.DecisionError, LookupError) as exc:
        return f"⚠️ {exc}"


def _describe_for_cancel(db, task_id: int, discord_user: discord.abc.User) -> str | None:
    """Prompt text for the cancel confirmation, or None if this user may not cancel."""

    task = db.get(models.BookingTask, task_id)
    if task is None or not confirmation.can_actor_decide(task, _actor(db, discord_user)):
        return None
    refund = ""
    if task.refund_deadline_at:
        refund = " It should be refunded" + (
            " as account credit." if task.booking_slot.provider.type.lower() == "better"
            else " to your card."
        )
    return f"Cancel **{render.short_id(task)}** ({render.describe(task)})?{refund}"


def _list_bookings(db, discord_user: discord.abc.User) -> str:
    actor = _actor(db, discord_user)
    if actor.user_id is None:
        return "Link your account first with `/bookie link`."
    tasks = (
        db.query(models.BookingTask)
        .join(models.BookingSlot)
        .filter(
            models.BookingSlot.user_id == actor.user_id,
            models.BookingTask.status == models.TaskStatusEnum.success,
            models.BookingTask.scheduled_date >= datetime.now(timezone.utc),
        )
        .order_by(models.BookingTask.scheduled_date)
        .limit(15)
        .all()
    )
    if not tasks:
        return "No upcoming bookings."
    lines = []
    for task in tasks:
        state = task.confirmation_status.value.replace("_", " ")
        lines.append(f"**{render.short_id(task)}** {render.describe(task)} · {state}")
    return "\n".join(lines)


def _link(db, code: str, discord_user: discord.abc.User) -> str:
    try:
        chat_links.consume_link_code(
            db, code, platform=chat_links.DISCORD,
            external_user_id=str(discord_user.id), external_username=discord_user.name,
        )
    except chat_links.LinkError as exc:
        return f"⚠️ {exc}"
    return (
        "🔗 Linked! Run `/bookie channel` in the channel where booking updates should go."
    )


def _use_channel(db, discord_user, guild_id: str | None, channel_id: str, name: str) -> str:
    actor = _actor(db, discord_user)
    if actor.user_id is None:
        return "Link your account first with `/bookie link`."
    chat_links.add_discord_destination(
        db, actor.user_id, guild_id=guild_id, channel_id=channel_id, name=name
    )
    return f"📣 Booking updates can now go to {name}. Pick it per session (or as your default) in the app."


def _unlink(db, discord_user) -> str:
    if chat_links.unlink(db, chat_links.DISCORD, str(discord_user.id)):
        return "Unlinked. You won't be able to keep or cancel bookings from Discord."
    return "This Discord account isn't linked."


def _confirm_by_reaction(db, message_id: str, discord_user) -> None:
    posted = (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.message_id == message_id,
            models.ChatMessage.purpose.in_(["booking", "reminder"]),
        )
        .first()
    )
    if posted is None or posted.booking_task_id is None:
        return
    task = db.get(models.BookingTask, posted.booking_task_id)
    if task is None or task.confirmation_status != models.ConfirmationStatusEnum.awaiting:
        return
    try:
        confirmation.confirm(db, task.id, _actor(db, discord_user))
    except (PermissionError, confirmation.DecisionError):
        pass  # reactions from other people are just reactions


class BookieBot(discord.Client):
    def __init__(self, *, dev_guild_id: int | None = None) -> None:
        intents = discord.Intents.default()
        intents.message_content = True  # for @mentions of the assistant
        super().__init__(intents=intents, allowed_mentions=discord.AllowedMentions.none())
        self.tree = app_commands.CommandTree(self)
        self.dev_guild_id = dev_guild_id
        self.tree.add_command(_bookie_commands())

    async def setup_hook(self) -> None:
        if self.dev_guild_id:
            guild = discord.Object(id=self.dev_guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)  # instant in this server
        await self.tree.sync()

    async def on_ready(self) -> None:
        logger.info("Discord bot connected as %s", self.user)

    async def on_interaction(self, interaction: discord.Interaction) -> None:
        if interaction.type != discord.InteractionType.component:
            return
        custom_id = (interaction.data or {}).get("custom_id", "")
        if not custom_id.startswith("ob:"):
            return
        try:
            _, action, raw_id = custom_id.split(":", 2)
            task_id = int(raw_id)
        except ValueError:
            return

        if action == "keep":
            await interaction.response.defer(ephemeral=True, thinking=True)
            reply = await in_db(_decide, "keep", task_id, interaction.user)
            await interaction.followup.send(reply, ephemeral=True)
        elif action == "cancel":
            prompt = await in_db(_describe_for_cancel, task_id, interaction.user)
            if prompt is None:
                await interaction.response.send_message(
                    "Only the booking's owner can cancel it.", ephemeral=True
                )
                return
            view = discord.ui.View(timeout=300)
            view.add_item(
                discord.ui.Button(
                    label="Yes, cancel it",
                    style=discord.ButtonStyle.danger,
                    custom_id=f"{render.CANCEL_CONFIRM_PREFIX}{task_id}",
                )
            )
            await interaction.response.send_message(prompt, view=view, ephemeral=True)
        elif action == "cancel_confirm":
            await interaction.response.defer(ephemeral=True, thinking=True)
            reply = await in_db(_decide, "cancel", task_id, interaction.user)
            await interaction.followup.send(reply, ephemeral=True)

    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent) -> None:
        if str(payload.emoji) != CONFIRM_EMOJI or payload.user_id == getattr(self.user, "id", None):
            return
        user = payload.member or await self.fetch_user(payload.user_id)
        await in_db(_confirm_by_reaction, str(payload.message_id), user)

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot or self.user is None or self.user not in message.mentions:
            return
        await message.reply(
            "The booking assistant isn't switched on yet. Use the buttons or `/bookie bookings` for now."
        )


def _bookie_commands() -> app_commands.Group:
    group = app_commands.Group(name="bookie", description="Bookie Monster bookings")

    @group.command(name="link", description="Link your Discord account using a code from the app")
    @app_commands.describe(code="The 8-character code from the app's Settings page")
    async def link(interaction: discord.Interaction, code: str) -> None:
        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send(await in_db(_link, code, interaction.user), ephemeral=True)

    @group.command(name="channel", description="Send booking updates to this channel")
    async def channel(interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        target = interaction.channel
        name = f"#{getattr(target, 'name', 'channel')}"
        if interaction.guild:
            name = f"{name} ({interaction.guild.name})"
        reply = await in_db(
            _use_channel,
            interaction.user,
            str(interaction.guild_id) if interaction.guild_id else None,
            str(interaction.channel_id),
            name,
        )
        await interaction.followup.send(reply, ephemeral=True)

    @group.command(name="unlink", description="Unlink your Discord account")
    async def unlink(interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send(await in_db(_unlink, interaction.user), ephemeral=True)

    @group.command(name="bookings", description="List your upcoming bookings")
    async def bookings(interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send(
            await in_db(_list_bookings, interaction.user), ephemeral=True
        )

    return group
