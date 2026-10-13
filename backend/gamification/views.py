import calendar
from datetime import date, datetime, timedelta

from django.db.models import Sum
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from claim.permissions import IsStaffMember

from items.models import ItemDetails
from .models import LeaderboardSettings, LeaderboardPlayer, PointTransaction
from .serializers import LeaderboardPlayerSerializer, PointTransactionSerializer
from .services import (
    award_points,
    get_item_points,
    CLAIMED_BONUS_POINTS,
    _normalize_student_id,
    registered_accounts_by_id,
)

VALID_REASONS = {"SURRENDER_ITEM", "ITEM_CLAIMED"}

# WHO CAN DO WHAT
# - Anyone may read the ranking and the settings (the public board's
#   Leaderboard page shows them).
# - Only Admin / Moderator staff may read the points history (it lists every
#   student's ID number), add points, or change the settings. Before this,
#   these endpoints had no login check at all: anyone, even logged out,
#   could give any ID number points or switch the leaderboard off.


def _to_bool(value, default):
    """True/False from JSON booleans or form strings ("true", "false", "1", "0")."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ("true", "1", "yes", "on"):
        return True
    if text in ("false", "0", "no", "off", ""):
        return False
    return default


def _to_date(value):
    """A date from "YYYY-MM-DD", None for blank; raises ValueError if invalid."""
    if value in (None, ""):
        return None
    return date.fromisoformat(str(value).strip()[:10])


def get_current_leaderboard_settings():
    settings, _ = LeaderboardSettings.objects.get_or_create(id=1)

    today = date.today()

    if settings.auto_mode and settings.open_date and settings.close_date:
        settings.is_active = settings.open_date <= today <= settings.close_date
        settings.save(update_fields=["is_active", "updated_at"])

    return settings


# =========================================================
# SEMESTER PERIOD (which points count on the leaderboard)
# =========================================================
# The leaderboard only counts points earned in the CURRENT semester. The
# semesters are the month ranges set in Leaderboard Control > Settings >
# "Semester Boundaries Configuration" (saved as sem_config). Months are
# 0-based like the page: 0 = January ... 11 = December.
DEFAULT_SEM_CONFIG = {
    "firstSem": {"startMonth": 7, "endMonth": 11},   # Aug - Dec
    "secondSem": {"startMonth": 0, "endMonth": 4},   # Jan - May
    "shortTerm": {"startMonth": 5, "endMonth": 6},   # Jun - Jul
}
TERMS = (
    ("firstSem", "1st Semester"),
    ("secondSem", "2nd Semester"),
    ("shortTerm", "Short Term"),
)


def _month(value, default):
    try:
        month = int(value)
    except (TypeError, ValueError):
        return default
    return month if 0 <= month <= 11 else default


def semester_config(settings):
    """The saved month ranges, with the defaults filling any gaps."""
    saved = settings.sem_config if isinstance(settings.sem_config, dict) else {}
    config = {}
    for key, _label in TERMS:
        default = DEFAULT_SEM_CONFIG[key]
        term = saved.get(key) if isinstance(saved.get(key), dict) else {}
        config[key] = {
            "startMonth": _month(term.get("startMonth"), default["startMonth"]),
            "endMonth": _month(term.get("endMonth"), default["endMonth"]),
        }
    return config


def _in_range(month, start, end):
    if start <= end:
        return start <= month <= end
    return month >= start or month <= end  # e.g. October to February


def _last_day(year, month0):
    return date(year, month0 + 1, calendar.monthrange(year, month0 + 1)[1])


def current_period(settings, on_date=None):
    """
    The semester the leaderboard is showing: its name, school year and the
    first/last day whose points count. Uses the Start Date when Automatic
    Mode is on (same as the Leaderboard Control title), otherwise today.
    """
    if on_date is None:
        on_date = settings.open_date if (settings.auto_mode and settings.open_date) else timezone.localdate()

    config = semester_config(settings)
    month = on_date.month - 1

    for key, label in TERMS:
        start_m, end_m = config[key]["startMonth"], config[key]["endMonth"]
        if not _in_range(month, start_m, end_m):
            continue

        if start_m <= end_m:
            start_year = end_year = on_date.year
        elif month >= start_m:
            start_year, end_year = on_date.year, on_date.year + 1
        else:
            start_year, end_year = on_date.year - 1, on_date.year

        start = date(start_year, start_m + 1, 1)
        end = _last_day(end_year, end_m)

        if key == "firstSem":
            school_year = f"{start.year}-{start.year + 1}"
        elif key == "secondSem":
            school_year = f"{end.year - 1}-{end.year}"
        else:
            school_year = f"{start.year}"

        return {"semester": label, "school_year": school_year, "start": start, "end": end}

    # A month that is in none of the three ranges: count that month only.
    return {
        "semester": "Custom Term",
        "school_year": f"{on_date.year}",
        "start": date(on_date.year, on_date.month, 1),
        "end": _last_day(on_date.year, month),
    }


def _period_json(period):
    return {
        "semester": period["semester"],
        "school_year": period["school_year"],
        "start": period["start"].isoformat(),
        "end": period["end"].isoformat(),
    }


def _period_bounds(period):
    """Start of the first day and start of the day after the last day, in local time."""
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(period["start"], datetime.min.time()), tz)
    end = timezone.make_aware(datetime.combine(period["end"] + timedelta(days=1), datetime.min.time()), tz)
    return start, end


def resolve_item(raw):
    """
    Accepts either the real ItemDetails id ("14") or the ticket code
    ("TKT-14-AB12") and returns the ItemDetails row, or None.
    Points records must always be keyed by the real item id so they never
    duplicate rows created by items/views.py.
    """
    if raw in (None, ""):
        return None

    raw = str(raw).strip()

    if raw.isdigit():
        return ItemDetails.objects.filter(pk=int(raw)).first()

    return ItemDetails.objects.filter(ticket_code__iexact=raw).first()


@api_view(["GET"])
@permission_classes([AllowAny])
def leaderboard(request):
    settings = get_current_leaderboard_settings()
    period = current_period(settings)

    if not settings.is_active:
        return Response({
            "active": False,
            "leaders": [],
            "period": _period_json(period),
        })

    # Every ranked person is returned (it used to stop at 20, so anyone
    # ranked 21st or lower never saw themselves and search couldn't find them).
    return Response({
        "active": True,
        "leaders": combined_leaders(period),
        "period": _period_json(period),
    })


def combined_leaders(period=None):
    """
    One leaderboard row per ID number, counting only points earned inside
    `period` (the current semester; see current_period()). Without a period
    every point ever earned counts. Rows saved under the same ID in
    different formats ("12345678" and "12345678@slc-sflu.edu.ph") are
    added together. A registered student is shown under their account
    name; otherwise the most recent name recorded for that ID is used.
    People with no points in the period are left out, so a new semester
    starts with an empty leaderboard.
    """
    account_names = registered_accounts_by_id()

    records = PointTransaction.objects.all()
    if period is not None:
        start, end = _period_bounds(period)
        records = records.filter(created_at__gte=start, created_at__lt=end)
    earned = dict(
        records.values("player_id").annotate(total=Sum("points")).values_list("player_id", "total")
    )

    rows = {}

    for player in LeaderboardPlayer.objects.filter(pk__in=earned).order_by("id"):
        id_number = _normalize_student_id(player.student_id)
        key = id_number or f"no-id-{player.pk}"

        row = rows.get(key)
        if row is None:
            row = rows[key] = {
                "id": player.pk,
                "student_id": id_number,
                "id_number": id_number,
                "full_name": player.full_name,
                "points": 0,
                "is_registered": id_number in account_names,
            }
        row["points"] += earned.get(player.pk) or 0
        if player.full_name:
            row["full_name"] = player.full_name  # latest name wins

    for row in rows.values():
        if row["is_registered"] and account_names.get(row["id_number"]):
            row["full_name"] = account_names[row["id_number"]]

    return sorted(
        (row for row in rows.values() if row["points"] > 0),
        key=lambda r: (-r["points"], (r["full_name"] or "").lower()),
    )


@api_view(["GET", "POST"])
@permission_classes([IsStaffMember])
def points_tracking(request):
    if request.method == "POST":
        data = request.data
        # `student_id` is the field name now. `id_number` is still accepted
        # as a fallback so any older frontend code keeps working.
        raw_student_id = data.get("student_id") or data.get("id_number")
        player_name = data.get("player_name", "")
        reason = data.get("reason")
        item_id_raw = data.get("item_id")

        if not raw_student_id or not reason:
            return Response({"detail": "student_id and reason are required."}, status=400)

        if reason not in VALID_REASONS:
            return Response({"detail": "Invalid reason."}, status=400)

        clean_student_id = _normalize_student_id(raw_student_id)
        if not clean_student_id:
            return Response({"detail": "student_id must contain digits."}, status=400)

        item = resolve_item(item_id_raw)
        if item is None:
            return Response(
                {"detail": "item_id must be a valid item id or ticket code."},
                status=400,
            )

        # Point values come from the server, not the client.
        points = get_item_points(item) if reason == "SURRENDER_ITEM" else CLAIMED_BONUS_POINTS

        already_exists = PointTransaction.objects.filter(
            player__student_id=clean_student_id,
            reason=reason,
            item_id=str(item.id),
        ).exists()

        transaction = award_points(
            student_id=clean_student_id,
            full_name=player_name,
            points=points,
            reason=reason,
            item_id=item.id,
        )

        if transaction is None:
            return Response({"detail": "Could not award points."}, status=400)

        # Backup & Restore sends the record's original date. Keep it, so a
        # restored record still counts in the semester it was earned in
        # instead of the day it was restored.
        created_at_raw = data.get("created_at")
        if created_at_raw and not already_exists:
            from django.utils.dateparse import parse_datetime
            original = parse_datetime(str(created_at_raw))
            if original is not None:
                if timezone.is_naive(original):
                    original = timezone.make_aware(original)
                if original <= timezone.now():
                    PointTransaction.objects.filter(pk=transaction.pk).update(created_at=original)
                    transaction.refresh_from_db()

        serializer = PointTransactionSerializer(transaction)
        # 200 = this item was already credited (no double award), 201 = new.
        return Response(serializer.data, status=200 if already_exists else 201)

    transactions = PointTransaction.objects.select_related("player").order_by("-created_at")
    serializer = PointTransactionSerializer(transactions, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def leaderboard_settings(request):
    settings = get_current_leaderboard_settings()

    return Response({
        "is_active": settings.is_active,
        "auto_mode": settings.auto_mode,
        "open_date": settings.open_date,
        "close_date": settings.close_date,
        "semConfig": settings.sem_config,
        # The semester whose points the leaderboard is counting right now.
        "period": _period_json(current_period(settings)),
    })


@api_view(["PUT"])
@permission_classes([IsStaffMember])
def update_leaderboard_settings(request):
    settings, _ = LeaderboardSettings.objects.get_or_create(id=1)

    # Bad dates used to crash the save (HTTP 500), and an end date before
    # the start date was accepted, which kept the leaderboard closed.
    try:
        open_date = _to_date(request.data.get("open_date"))
        close_date = _to_date(request.data.get("close_date"))
    except ValueError:
        return Response({"detail": "Dates must be valid dates (YYYY-MM-DD)."}, status=400)

    if open_date and close_date and open_date > close_date:
        return Response({"detail": "The close date must be on or after the open date."}, status=400)

    settings.auto_mode = _to_bool(request.data.get("auto_mode"), settings.auto_mode)
    settings.open_date = open_date
    settings.close_date = close_date

    if not settings.auto_mode:
        settings.is_active = _to_bool(request.data.get("is_active"), settings.is_active)

    # Custom semester months (saved so they don't reset after Save).
    if "semConfig" in request.data:
        sem_config = request.data.get("semConfig")
        settings.sem_config = sem_config if isinstance(sem_config, dict) else None

    settings.save()

    return Response({"message": "Leaderboard settings updated"})
