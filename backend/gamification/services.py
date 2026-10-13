# gamification/services.py
from django.db import transaction
from .models import LeaderboardPlayer, PointTransaction

# Points awarded when a surrendered item is later claimed by its owner.
CLAIMED_BONUS_POINTS = 2

# Flat point value per surrendered item (regardless of category/item
# name) -- replaces the old category-tiered ITEM_POINTS scheme. Combined
# with CLAIMED_BONUS_POINTS above, a fully-claimed item now earns
# 8 + 2 = 10 points total for its finder.
SURRENDER_POINTS = 8


def get_item_points(item):
    """
    Kept as a function (rather than inlining SURRENDER_POINTS at the call
    site) so any existing callers don't need to change -- it just always
    returns the flat surrender value now instead of a category lookup.
    """
    return SURRENDER_POINTS


def _normalize_student_id(raw_id):
    """
    The ID number is the one reference for a leaderboard player, whether
    or not the student has an account yet. "12345678" and
    "12345678@slc-sflu.edu.ph" both resolve to "12345678".
    This has to match Leaderboard.jsx's normalizeId() on the frontend --
    that's what the "You" badge and student-ID matching compare against.
    Returns "" if nothing digit-like is present.
    """
    local_part = str(raw_id or "").split("@", 1)[0]
    return "".join(ch for ch in local_part if ch.isdigit())


def registered_accounts_by_id():
    """
    {id_number: "First Last"} for every verified account whose email or
    username starts with an ID number. Used so a student who registers
    AFTER earning points is shown under their account name, with all the
    points they earned before registering (points are keyed by ID number,
    never by account).
    """
    from django.contrib.auth import get_user_model

    Account = get_user_model()
    accounts = Account.objects.all()
    if hasattr(Account, "is_verified"):
        accounts = accounts.filter(is_verified=True)

    names = {}
    for account in accounts.only("email", "username", "first_name", "last_name"):
        for value in (account.email, account.username):
            id_number = _normalize_student_id(value)
            if id_number:
                full = f"{account.first_name or ''} {account.last_name or ''}".strip()
                names.setdefault(id_number, full)
                break
    return names


@transaction.atomic
def award_points(student_id, full_name, points, reason, item_id=None):
    clean_student_id = _normalize_student_id(student_id)
    clean_name = " ".join((full_name or "").strip().split())

    if not clean_student_id or points <= 0:
        return None

    # A registered student's account name always wins over whatever name
    # was typed on the item form.
    account_name = registered_accounts_by_id().get(clean_student_id)
    if account_name:
        clean_name = account_name

    player, _ = LeaderboardPlayer.objects.get_or_create(
        student_id=clean_student_id,
        defaults={
            "full_name": clean_name,
        }
    )

    if clean_name and player.full_name != clean_name:
        player.full_name = clean_name
        player.save(update_fields=["full_name"])

    # NOTE: get_or_create's uniqueness here relies on (player, reason,
    # item_id) actually identifying ONE item -- item_id must be the real
    # item's id, never None/omitted, or every surrender for the same
    # player+reason will collide with the first one and silently stop
    # awarding points after the very first call.
    point_transaction, created = PointTransaction.objects.get_or_create(
        player=player,
        reason=reason,
        item_id=item_id,
        defaults={
            "points": points,
        }
    )

    if created:
        player.points += points
        player.save(update_fields=["points"])

    return point_transaction


def award_surrender_points(student_id, full_name, item, reason="SURRENDER_ITEM"):
    """
    Award the flat SURRENDER_POINTS (8) for a newly created found item.
    Call this once, right after the item is successfully saved, using
    its own `id` as `item_id`.
    """
    return award_points(
        student_id=student_id,
        full_name=full_name,
        points=get_item_points(item),
        reason=reason,
        item_id=item.id,
    )


def award_claim_points(student_id, full_name, item, reason="ITEM_CLAIMED"):
    """
    Award CLAIMED_BONUS_POINTS (2) when a surrendered item is marked
    Claimed. Call this once, right after the item's status is updated to
    "Claimed", using its own `id` as `item_id` -- keeps this idempotent
    if the claim endpoint is ever called twice for the same item (e.g. a
    retried request, or someone re-saving an already-claimed item).
    """
    return award_points(
        student_id=student_id,
        full_name=full_name,
        points=CLAIMED_BONUS_POINTS,
        reason=reason,
        item_id=item.id,
    )

@transaction.atomic
def revoke_item_points(item_id):
    """
    Takes back every point given for one item (the surrender points and the
    claimed bonus) and removes those records. Used when a surrendered item is
    deleted, e.g. one added by mistake, so the finder doesn't keep points for
    an item that no longer exists. Returns how many points were removed.
    """
    records = PointTransaction.objects.filter(item_id=str(item_id))

    # Add up per player first, then update each player once (one item can
    # have both a surrender and a claimed-bonus record for the same finder).
    per_player = {}
    for player_id, points in records.values_list("player_id", "points"):
        per_player[player_id] = per_player.get(player_id, 0) + points

    for player in LeaderboardPlayer.objects.select_for_update().filter(pk__in=per_player):
        player.points = max(0, player.points - per_player[player.pk])
        player.save(update_fields=["points"])

    records.delete()
    return sum(per_player.values())
