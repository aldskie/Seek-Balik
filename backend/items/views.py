import json
import logging
import re
from gamification.services import award_points, get_item_points, CLAIMED_BONUS_POINTS
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import ItemDetails, ItemImage
from .serializers import ItemSerializers
from notification.service import send_new_report_notification
from alerts.services import (
    notify_lost_report_reviewed,
    notify_staff_new_lost_report,
    notify_surrendered_item_claimed,
)
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from claim.permissions import IsStaffMember

logger = logging.getLogger(__name__)

MAX_IMAGES_PER_ITEM = 3


def _sync_cover_image(item):
    """Keeps the legacy single `image` field equal to the item's first photo
    (or empty when it has none), so every page shows the same cover."""
    first = item.images.order_by('id').first()
    new_name = first.image.name if first else None
    if (item.image.name or None) != new_name:
        item.image = new_name
        item.save(update_fields=['image'])

# Student account emails look like 12345678@slc-sflu.edu.ph; the 8 digits
# are the Student ID stored in ItemDetails.student_id.
ACCOUNT_EMAIL_PATTERN = re.compile(r'^(\d{8})@slc-sflu\.edu\.ph$', re.IGNORECASE)


def _finder_id(item):
    """
    The finder's bare 8-digit Student ID, used for gamification points.
    None if the item has no Student ID recorded.
    """
    return item.student_id or None


# GET ALL ITEMS
@api_view(['GET'])
def get_item_details(request):
    items = ItemDetails.objects.all()
    serializer = ItemSerializers(items, many=True, context={'request': request})
    return Response(serializer.data)


# Fields only staff may set when an item is created. A student or employee
# reporting a lost item can't mark it Approved, log a "Surrendered" item
# (which gives leaderboard points), or fill in release details.
STAFF_ONLY_CREATE_FIELDS = (
    'status_before_archive', 'declined_remarks', 'released_by',
    'claimed_by_name', 'claimed_by_email', 'claimed_by_contact',
    'claimed_date', 'claimed_time',
    'surrender_points_awarded', 'claimed_bonus_awarded',
    'verification_answer_1', 'verification_answer_2',
    'verification_answer_3', 'verification_answer_4',
)


# CREATE ITEM (WITH EMAIL + TICKET SYSTEM)
# Must be logged in (the Report Lost form and the staff pages always are).
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_item_details(request):
    data = request.data
    if not IsStaffMember().has_permission(request, None):
        # Same shallow copy as ItemSerializers.to_internal_value (keeps any
        # uploaded photos usable).
        import copy as _copy
        data = _copy.copy(request.data)
        for key in STAFF_ONLY_CREATE_FIELDS:
            if key in data:
                del data[key]
        # A student/employee can only file a LOST report, as themselves,
        # and it always waits for staff review.
        data['type'] = 'Lost'
        data['status'] = 'Pending'
        if request.user.email:
            data['email'] = request.user.email

    serializer = ItemSerializers(data=data, context={'request': request})

    if serializer.is_valid():
        item = serializer.save()

        # Every uploaded photo arrives as a repeated 'image' entry; store each
        # as its own ItemImage row, capped server-side.
        images_list = request.FILES.getlist('image')[:MAX_IMAGES_PER_ITEM]
        for img_file in images_list:
            ItemImage.objects.create(item=item, image=img_file)
        _sync_cover_image(item)

        # Bell notification for admins & moderators (Lost reports only).
        notify_staff_new_lost_report(item, actor=request.user)

        if (
            item.type == "Surrendered"
            and item.status == "Approved"
            and not item.surrender_points_awarded
        ):
            finder_id = _finder_id(item)
            if finder_id:
                award_points(
                    student_id=finder_id,
                    full_name=item.poster_name,
                    points=get_item_points(item),
                    reason="SURRENDER_ITEM",
                    item_id=item.id,
                )

                item.surrender_points_awarded = True
                item.save(update_fields=["surrender_points_awarded"])
            else:
                logger.warning(
                    "No Student ID on surrendered item %s (ticket %s); points not awarded.",
                    item.id, item.ticket_code,
                )

        if item.email:
            try:
                send_new_report_notification(item)
            except Exception:
                logger.exception(
                    "Failed to send lost item report email to %s (ticket %s)",
                    item.email, item.ticket_code,
                )

        return Response({
            "message": "Item created successfully",
            "ticket_code": item.ticket_code,
            "data": ItemSerializers(item, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# GET SINGLE ITEM + UPDATE + DELETE
@api_view(['GET', 'PUT', 'DELETE'])
def item_details(request, pk):
    try:
        item = ItemDetails.objects.get(pk=pk)
    except ItemDetails.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = ItemSerializers(item, context={'request': request})
        return Response(serializer.data)

    # Editing (approve/decline, mark Claimed, archive...) and deleting an
    # item is staff-only. Previously anyone, even logged out, could do it.
    if not IsStaffMember().has_permission(request, None):
        logged_in = bool(request.user and request.user.is_authenticated)
        return Response(
            {"detail": IsStaffMember.message},
            status=status.HTTP_403_FORBIDDEN if logged_in else status.HTTP_401_UNAUTHORIZED,
        )

    if request.method == 'PUT':
        # Remembered so a status change can be told apart from other edits.
        old_status = item.status

        serializer = ItemSerializers(item, data=request.data, partial=True, context={'request': request})

        if serializer.is_valid():
            updated_item = serializer.save()

            # Archiving remembers the current status; restoring clears it.
            if updated_item.status == "Archived" and old_status != "Archived":
                updated_item.status_before_archive = old_status
                updated_item.save(update_fields=["status_before_archive"])
            elif old_status == "Archived" and updated_item.status != "Archived":
                updated_item.status_before_archive = ""
                updated_item.save(update_fields=["status_before_archive"])

            # PHOTO HANDLING ON EDIT
            #   - `keep_image_ids` (optional): JSON array of ItemImage ids to
            #     KEEP. Existing images not in the list are deleted. If the
            #     field is omitted, nothing existing is deleted.
            #   - `image` (optional, repeatable): new files, filling remaining
            #     slots up to MAX_IMAGES_PER_ITEM.
            keep_ids_raw = request.data.get('keep_image_ids')
            if keep_ids_raw is not None:
                try:
                    keep_ids = {int(i) for i in json.loads(keep_ids_raw)}
                except (TypeError, ValueError):
                    # Malformed input: don't guess, don't delete anything.
                    keep_ids = set(item.images.values_list('id', flat=True))

                item.images.exclude(id__in=keep_ids).delete()

            remaining_slots = max(0, MAX_IMAGES_PER_ITEM - item.images.count())
            images_list = request.FILES.getlist('image')[:remaining_slots]
            for img_file in images_list:
                ItemImage.objects.create(item=updated_item, image=img_file)
            _sync_cover_image(updated_item)

            # In-app notification when a Lost report is approved or declined.
            notify_lost_report_reviewed(updated_item, old_status)

            # Item released: close every other open claim on it, with a
            # notice to each claimant (claim/closing.py).
            if (
                updated_item.status == "Claimed"
                and old_status != "Claimed"
            ):
                try:
                    from claim.closing import close_other_claims
                    close_other_claims(updated_item)
                except Exception:
                    logger.exception("Could not close other claims for item %s", updated_item.id)

            if (
                updated_item.type == "Surrendered"
                and updated_item.status == "Claimed"
                and not updated_item.claimed_bonus_awarded
            ):
                finder_id = _finder_id(updated_item)
                if finder_id:
                    award_points(
                        student_id=finder_id,
                        full_name=updated_item.poster_name,
                        points=CLAIMED_BONUS_POINTS,
                        reason="ITEM_CLAIMED",
                        item_id=updated_item.id,
                    )

                    updated_item.claimed_bonus_awarded = True
                    updated_item.save(update_fields=["claimed_bonus_awarded"])

                    # In-app notification for the finder.
                    notify_surrendered_item_claimed(updated_item, CLAIMED_BONUS_POINTS)
                else:
                    logger.warning(
                        "No Student ID on item %s (ticket %s); claimed bonus not awarded.",
                        updated_item.id, updated_item.ticket_code,
                    )

            return Response(
                ItemSerializers(updated_item, context={'request': request}).data,
                status=status.HTTP_200_OK
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        # A deleted item (e.g. one added by mistake) must not keep earning
        # its finder leaderboard points.
        item_id = item.id
        item.delete()
        try:
            from gamification.services import revoke_item_points
            revoke_item_points(item_id)
        except Exception:
            logger.exception("Could not remove leaderboard points for deleted item %s", item_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# VERIFY OWNERSHIP ANSWERS (used by the public Claim Modal)
# Login required, so it can't be used anonymously to guess the answers.
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_answers(request, pk):
    """
    Grades a claimant's selected multiple-choice answers against the real
    verification_answer_N values server-side. The correct answer text is
    NEVER returned, only per-question true/false plus an overall flag.

    Body: {"answers": {"1": "chosen text", "2": "chosen text", ...}}
    """
    try:
        item = ItemDetails.objects.get(pk=pk)
    except ItemDetails.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    submitted = request.data.get("answers", {}) or {}
    if not isinstance(submitted, dict):
        return Response(
            {"detail": "answers must be an object keyed by question number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    results = {}
    for n in range(1, 5):
        real_answer = (getattr(item, f'verification_answer_{n}') or '').strip()
        if not real_answer:
            continue

        key = str(n)
        if key not in submitted:
            continue

        chosen = str(submitted.get(key) or '').strip()
        results[key] = chosen.lower() == real_answer.lower()

    all_correct = bool(results) and all(results.values())

    return Response(
        {"results": results, "all_correct": all_correct},
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
def track_item(request, ticket_code):
    try:
        # Accept lower-case letters and stray spaces (e.g. " tkt-12-ab3f ").
        code = "".join(str(ticket_code or "").split()).upper()
        item = ItemDetails.objects.get(ticket_code__iexact=code)

        serializer = ItemSerializers(item, context={'request': request})

        return Response({
            "found": True,
            "item": serializer.data
        })

    except ItemDetails.DoesNotExist:
        return Response({
            "found": False,
            "message": "Ticket not found"
        }, status=status.HTTP_404_NOT_FOUND)


# ITEMS REPORTED BY THE LOGGED-IN USER
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_my_items(request):
    user = request.user
    email = (user.email or '').strip()

    # A blank email must never match rows that also have a blank email.
    if not email:
        return Response([])

    # Match the item's own email field, and also the Student ID when the
    # account email is a student email (12345678@slc-sflu.edu.ph). Only
    # that exact pattern is trusted, so an unrelated address like
    # 12345678@other.com can't see someone else's items.
    query = Q(email__iexact=email)
    match = ACCOUNT_EMAIL_PATTERN.match(email)
    if match:
        query |= Q(student_id=match.group(1))

    items = ItemDetails.objects.filter(query).order_by('-time_stamp')

    # Optional ?type=Lost or ?type=Surrendered
    type_filter = request.query_params.get('type')
    if type_filter in ('Lost', 'Surrendered'):
        items = items.filter(type=type_filter)

    serializer = ItemSerializers(items, many=True, context={'request': request})
    return Response(serializer.data)