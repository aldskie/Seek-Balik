"""
ACTIVITY LOGS API

GET  activity/          Admin / Moderator: the logs, newest first.
POST activity/          Any logged-in account: record one action. Only
                        actions by Admin / Moderator are stored (the page
                        only shows staff actions); others get 204 and are
                        ignored. Who did it comes from the login, not from
                        what the browser sends.
POST activity/import/   Admin / Moderator: bring in older entries (logs
                        saved in a browser before this existed, or a
                        Backup & Restore file). Each entry is added once,
                        matched by its id.

There is no edit or delete: an audit trail can't be changed from the
website.
"""
from datetime import datetime

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from claim.permissions import IsStaffMember

from .models import ActivityLog

STAFF_ROLES = ("admin", "moderator")
MAX_RETURNED = 2000
MAX_IMPORT = 1000


def _text(value, limit):
    return str(value or "").strip()[:limit]


def _full_name(user):
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or user.email or user.username or "Staff"


def _as_json(log):
    return {
        "id": log.client_id or f"srv_{log.pk}",
        "actor_name": log.actor_name,
        "actor_role": log.actor_role,
        "performed_by_role": log.performed_by_role,
        "action": log.action,
        "target_title": log.target_title,
        "details": log.details,
        "created_at": log.created_at.isoformat(),
    }


def _parse_time(raw):
    if not raw:
        return None
    parsed = parse_datetime(str(raw))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    # Never accept a time in the future.
    return min(parsed, timezone.now())


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def activity_logs(request):
    is_staff = IsStaffMember().has_permission(request, None)

    if request.method == "GET":
        if not is_staff:
            return Response({"detail": IsStaffMember.message}, status=status.HTTP_403_FORBIDDEN)
        logs = ActivityLog.objects.all()[:MAX_RETURNED]
        return Response([_as_json(log) for log in logs])

    # POST: record one action done by the logged-in staff member.
    user = request.user
    if not is_staff:
        return Response(status=status.HTTP_204_NO_CONTENT)

    action = _text(request.data.get("action"), 40)
    if not action:
        return Response({"detail": "action is required."}, status=status.HTTP_400_BAD_REQUEST)

    client_id = _text(request.data.get("id") or request.data.get("client_id"), 64) or None
    if client_id and ActivityLog.objects.filter(client_id=client_id).exists():
        log = ActivityLog.objects.get(client_id=client_id)
        return Response(_as_json(log), status=status.HTTP_200_OK)

    try:
        with transaction.atomic():
            log = ActivityLog.objects.create(
                client_id=client_id,
                actor=user,
                actor_name=_full_name(user),
                actor_role=user.role,
                performed_by_role=user.role,
                action=action,
                target_title=_text(request.data.get("target_title"), 255),
                details=_text(request.data.get("details"), 5000),
            )
    except IntegrityError:
        # The same entry arrived twice at once.
        log = ActivityLog.objects.get(client_id=client_id)
        return Response(_as_json(log), status=status.HTTP_200_OK)
    return Response(_as_json(log), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsStaffMember])
def import_activity_logs(request):
    entries = request.data.get("logs") if isinstance(request.data, dict) else request.data
    if not isinstance(entries, list):
        return Response({"detail": "Send a list of log entries."}, status=status.HTTP_400_BAD_REQUEST)

    added = skipped = 0
    for entry in entries[:MAX_IMPORT]:
        if not isinstance(entry, dict):
            skipped += 1
            continue
        action = _text(entry.get("action"), 40)
        client_id = _text(entry.get("id") or entry.get("client_id"), 64) or None
        if not action or (client_id and ActivityLog.objects.filter(client_id=client_id).exists()):
            skipped += 1
            continue
        try:
            with transaction.atomic():
                ActivityLog.objects.create(
                    client_id=client_id,
                    actor=None,
                    actor_name=_text(entry.get("actor_name"), 150) or "System",
                    actor_role=_text(entry.get("actor_role"), 30),
                    performed_by_role=_text(entry.get("performed_by_role"), 30),
                    action=action,
                    target_title=_text(entry.get("target_title"), 255),
                    details=_text(entry.get("details"), 5000),
                    created_at=_parse_time(entry.get("created_at")) or timezone.now(),
                )
        except IntegrityError:
            # Added a moment ago by another request with the same id.
            skipped += 1
            continue
        added += 1

    return Response({"added": added, "skipped": skipped}, status=status.HTTP_200_OK)
