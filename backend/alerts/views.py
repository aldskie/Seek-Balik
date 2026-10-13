from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification, PushToken
from .services import get_preference

# The newest notifications returned to the app in one request.
MAX_NOTIFICATIONS = 50

PREFERENCE_FIELDS = ("push_enabled", "email_enabled")


def _serialize(notification):
    return {
        "id": notification.id,
        "kind": notification.kind,
        "title": notification.title,
        "body": notification.body,
        "data": notification.data,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat(),
    }


def _unread_count(user):
    return Notification.objects.filter(account=user, is_read=False).count()


# LIST — the logged-in account's newest notifications plus the unread count.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_notifications(request):
    notifications = Notification.objects.filter(account=request.user)[:MAX_NOTIFICATIONS]

    return Response({
        "unread": _unread_count(request.user),
        "results": [_serialize(n) for n in notifications],
    })


# UNREAD COUNT — small request used by the bell badge.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count(request):
    return Response({"unread": _unread_count(request.user)})


# MARK ONE AS READ — only works on the account's own notification.
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read(request, pk):
    updated = Notification.objects.filter(pk=pk, account=request.user).update(is_read=True)

    if not updated:
        return Response(
            {"error": "Notification not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response({"unread": _unread_count(request.user)})


# MARK ALL AS READ
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    Notification.objects.filter(account=request.user, is_read=False).update(is_read=True)
    return Response({"unread": 0})


# PREFERENCES — the Push Alerts / School Email switches.
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def preferences(request):
    preference = get_preference(request.user)

    if request.method == "PATCH":
        changed = []

        for field in PREFERENCE_FIELDS:
            if field not in request.data:
                continue

            value = request.data.get(field)
            if not isinstance(value, bool):
                return Response(
                    {"error": f"{field} must be true or false."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            setattr(preference, field, value)
            changed.append(field)

        if changed:
            preference.save(update_fields=changed + ["updated_at"])

    return Response({
        "push_enabled": preference.push_enabled,
        "email_enabled": preference.email_enabled,
    })


# PUSH TOKEN — saves this phone for the logged-in account.
# A phone has one token, so it moves to whichever account logged in last.
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_push_token(request):
    token = str(request.data.get("token") or "").strip()
    platform = str(request.data.get("platform") or "").strip()[:20]

    if not token or len(token) > 255:
        return Response(
            {"error": "A valid push token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    PushToken.objects.update_or_create(
        token=token,
        defaults={"account": request.user, "platform": platform},
    )

    return Response({"registered": True})


# PUSH TOKEN REMOVE — called on logout so this phone stops receiving pushes.
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_push_token(request):
    token = str(request.data.get("token") or "").strip()

    PushToken.objects.filter(token=token, account=request.user).delete()

    return Response({"registered": False})
