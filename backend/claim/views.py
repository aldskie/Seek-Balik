import re
from datetime import datetime
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Claim, AvailableSchedule, BlockedSlot
from .serializers import (
    ClaimSerializer,
    AvailableScheduleSerializer,
    BlockedSlotSerializer,
    slot_error_for,
)
from .noshow import (
    TIMED_OUT,
    BLOCKED_MESSAGE,
    mark_timed_out_claims,
    online_claim_blocked,
)
from .permissions import IsStaffMember
from items.models import ItemDetails
from notification.service import send_claim_declined_notification
from alerts.services import (
    email_allowed,
    notify_claim_declined,
    notify_claim_scheduled,
    notify_staff_new_claim,
)

User = get_user_model()

# Claims that are over: staff can no longer schedule or decline them.
FINISHED_CLAIM_STATUSES = ("Declined", "Closed", "Released")
FINISHED_STATUS_WORDS = {
    "Declined": "declined",
    "Closed": "closed (the item went to another claimant)",
    "Released": "released (the claimant already received the item)",
}


def _as_bool(value, default=False):
    """
    Safely reads a boolean from request.data. JSON bodies already give
    real booleans, but form-encoded bodies send "true"/"false" strings,
    and bool("false") would wrongly be True.
    """
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


# -------------------------------------------------------------------
# CLAIM EXPIRY (shared by create_claim's duplicate guard and
# check_item_claim)
#
# Mirrors parseSlotEnd() in PublicBoard.jsx / ClaimModal.jsx exactly,
# so the backend and both frontend components agree on the instant a
# scheduled claim's verification-meeting slot ends. Previously the
# backend had NO notion of this at all: create_claim's duplicate guard
# treated any "Pending"/"Scheduled" claim as blocking forever, and the
# frontend's own client-side expiry unlock was deliberately removed
# for exactly that reason (see the comment above checkExistingClaim in
# ClaimModal.jsx) — the backend would just 400 the resubmission anyway.
# This introduces the missing server-side half so a claimant becomes
# free to submit a new claim once their previous meeting time has
# actually passed.
# -------------------------------------------------------------------

def parse_meeting_end_datetime(meeting_date, meeting_time):
    """
    Given a Claim's meeting_date (a date) and meeting_time (a string
    like "9:00 AM - 10:00 AM"), returns the datetime the slot ends, or
    None if either is missing or the time string doesn't parse.
    """
    if not meeting_date or not meeting_time:
        return None

    parts = meeting_time.split("-")
    if len(parts) != 2:
        return None

    end_label = parts[1].strip()
    match = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", end_label, re.IGNORECASE)
    if not match:
        return None

    hours = int(match.group(1))
    minutes = int(match.group(2))
    meridiem = match.group(3).upper()

    if meridiem == "PM" and hours != 12:
        hours += 12
    if meridiem == "AM" and hours == 12:
        hours = 0

    return datetime.combine(meeting_date, datetime.min.time()).replace(
        hour=hours, minute=minutes, second=0, microsecond=0
    )


def claim_blocks_new_claim(claim):
    """
    True if this claim should still prevent the same claimant from
    submitting a new claim for the same item.

    - A claim with no meeting_date/meeting_time yet (still awaiting
      staff review — see create_claim's "pending review" path) always
      blocks: there's no scheduled slot to expire.
    - A claim with a scheduled slot blocks only while that slot's end
      time hasn't passed yet. Once it has, this returns False so a
      fresh/rescheduled claim is allowed.
    - If the time string can't be parsed for some reason, fails safe
      (still blocks) rather than silently letting a claim's expiry go
      unchecked.

    Callers are expected to have already filtered to
    status__in=["Pending", "Scheduled"] — a Declined/Cancelled/
    Completed claim never blocks regardless of its meeting time.
    """
    if not claim.meeting_date:
        return True

    # Blocks through the whole meeting day; the claimant can claim again
    # starting the day AFTER the meeting date (matches the public board,
    # which disables the Claim button until then).
    meeting_day = claim.meeting_date
    if isinstance(meeting_day, str):
        try:
            meeting_day = datetime.strptime(meeting_day[:10], "%Y-%m-%d").date()
        except ValueError:
            return True

    return datetime.now().date() <= meeting_day


def get_active_claim(item_id, claimant_email):
    """
    The ONE rule for "does this claimant currently have an active claim
    on this item?", used by create_claim, check_claim_status and
    check_item_claim so the three can never disagree.

    FIX: check_claim_status used to answer with a plain
    status__in=["Pending", "Scheduled"] check, while check_item_claim
    additionally applied the expiry rule (claim_blocks_new_claim). When
    a claim's meeting had already passed, the first said
    "claimed: true" and the second said "has_claim: false" — so the
    mobile Home screen opened its "already claimed" modal but had no
    date/time to show in it.

    Returns the claim, or None. Among several active claims it prefers
    one that has a meeting date/time, then the newest, so the schedule
    shown to the claimant is always the same one.
    """
    if not item_id or not claimant_email:
        return None

    candidate_claims = Claim.objects.filter(
        item_id=item_id,
        claimant_email__iexact=claimant_email.strip(),
        status__in=["Pending", "Scheduled"],
    ).order_by("-claim_date")

    active = [c for c in candidate_claims if claim_blocks_new_claim(c)]
    if not active:
        return None

    with_schedule = [c for c in active if c.meeting_date and c.meeting_time]
    return (with_schedule or active)[0]


# -------------------------------------------------------------------
# AVAILABLE SCHEDULE ENDPOINTS (Used by Admin & User Claim Modal)
# -------------------------------------------------------------------

@api_view(['GET', 'POST'])
def available_schedules(request):
    """
    GET: Fetch active schedule slots (used by ClaimModal.jsx and
    ClaimRequests.jsx). Accepts an optional ?date=YYYY-MM-DD query
    param to narrow results to a single day — ClaimModal.jsx uses this
    to populate the claimant's time-slot dropdown for whichever date
    they picked. ClaimRequests.jsx's own calls omit the param and get
    the full active/future list, exactly as before.
    POST: Staff creates a new available time slot (used by ClaimRequests.jsx).
    """
    if request.method == 'GET':
        # Retrieve only active slots occurring today or in the future
        schedules = AvailableSchedule.objects.filter(
            is_active=True,
            date__gte=datetime.today().date()
        )

        date_param = request.GET.get('date')
        if date_param:
            schedules = schedules.filter(date=date_param)

        schedules = schedules.order_by('date', 'time_slot')
        serializer = AvailableScheduleSerializer(schedules, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        # Only staff (admin/moderator) can create preset schedule slots.
        if not IsStaffMember().has_permission(request, None):
            return Response(
                {"detail": IsStaffMember.message},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = AvailableScheduleSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, IsStaffMember])
def delete_schedule(request, pk):
    """
    DELETE: Remove a preset schedule slot (used by ClaimRequests.jsx).
    Staff-only.
    """
    schedule = get_object_or_404(AvailableSchedule, pk=pk)
    schedule.delete()
    return Response({"message": "Schedule slot deleted successfully"}, status=status.HTTP_200_OK)


# -------------------------------------------------------------------
# BLOCKED (DISABLED) SLOTS — "Manage Slots" calendar in ClaimRequests.jsx
# -------------------------------------------------------------------

@api_view(['GET', 'POST'])
def blocked_slots(request):
    """
    GET (public): disabled meeting slots from today onward. Optional
    ?date=YYYY-MM-DD for one day, or ?start=&end= for a range (the staff
    calendar asks for one month at a time). ClaimModal.jsx uses this to
    hide disabled slots from claimants.

    POST (staff): disable a whole day ({date, reason}) or one slot
    ({date, time_slot, reason}). Already-booked meetings in that block
    are NOT cancelled; the response's affected_claims tells staff how
    many they need to reschedule.
    """
    is_staff = IsStaffMember().has_permission(request, None)

    if request.method == 'GET':
        blocks = BlockedSlot.objects.all()
        date_param = request.GET.get('date')
        start = request.GET.get('start')
        end = request.GET.get('end')
        if date_param:
            blocks = blocks.filter(date=date_param)
        else:
            blocks = blocks.filter(date__gte=start or datetime.today().date())
            if end:
                blocks = blocks.filter(date__lte=end)
        serializer = BlockedSlotSerializer(
            blocks.order_by('date', 'time_slot'),
            many=True,
            context={"include_affected": is_staff},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not is_staff:
        return Response({"detail": IsStaffMember.message}, status=status.HTTP_403_FORBIDDEN)

    serializer = BlockedSlotSerializer(data=request.data, context={"include_affected": True})
    if serializer.is_valid():
        block = serializer.save(created_by=getattr(request.user, "username", "") or "")
        # A whole-day block makes that day's single-slot blocks redundant.
        if block.is_whole_day:
            BlockedSlot.objects.filter(date=block.date).exclude(pk=block.pk).delete()
        return Response(
            BlockedSlotSerializer(block, context={"include_affected": True}).data,
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, IsStaffMember])
def delete_blocked_slot(request, pk):
    """DELETE (staff): re-enable a disabled day/slot."""
    block = get_object_or_404(BlockedSlot, pk=pk)
    block.delete()
    return Response({"message": "Slot re-enabled."}, status=status.HTTP_200_OK)


# -------------------------------------------------------------------
# CLAIM ENDPOINTS
# -------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaffMember])
def get_claim(request):
    """
    Staff-only: lists every claim, including each item's internal
    `description` (item_details.description) so admin/moderator can compare
    it against the claimant's ownership verification answers.
    """
    mark_timed_out_claims()
    claims = Claim.objects.all().order_by('-claim_date')
    serializer = ClaimSerializer(
        claims,
        many=True,
        context={"request": request, "include_item_description": True},
    )
    return Response(serializer.data, status=status.HTTP_200_OK)


# Set by staff actions only (schedule_meeting / decline_claim), or worked
# out by the server. A claimant used to be able to send these and submit a
# claim that was already "Scheduled" and marked as approved by staff.
CLIENT_BLOCKED_CLAIM_FIELDS = (
    "status",
    "staff_scheduled",
    "staff_approved_despite_mismatch",
    "needs_manual_review",
    "reminder_sent_at",
)


def _answers_match_item(item, data):
    """
    True when the claimant's answers match every verification answer staff
    recorded on the item (case-insensitive, trimmed). Questions without a
    recorded answer don't count against the claimant. Same rule as
    verify_answers() below, but decided by the server when the claim is
    saved, so a claimant can't simply send needs_manual_review=false.
    """
    for n in range(1, 5):
        question = getattr(item, f"verification_question_{n}", None)
        recorded = getattr(item, f"verification_answer_{n}", None)
        if not question or not str(question).strip():
            continue
        if recorded is None or str(recorded).strip() == "":
            continue
        if _normalize(recorded) != _normalize(data.get(f"answer_{n}", "")):
            return False
    return True


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_claim(request):

    # Must be logged in (the Claim form always is). A student or employee
    # always claims as THEMSELVES: the claim email is taken from their
    # account, so nobody can file a claim under someone else's email or
    # dodge the "declined, can't claim again" rule with another address.
    # Staff may still record a claim for a walk-in claimant.
    data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
    for key in CLIENT_BLOCKED_CLAIM_FIELDS:
        data.pop(key, None)

    if not IsStaffMember().has_permission(request, None):
        account_email = (request.user.email or "").strip()
        if not account_email:
            return Response(
                {"detail": "Your account has no email address, so it can't submit a claim."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data["claimant_email"] = account_email

    claimant_email = data.get("claimant_email")
    item_id = data.get("item")

    # Only items still open on the public board can be claimed. Once staff
    # mark an item Claimed (or it is archived/declined), any form
    # left open in a browser can no longer create a claim on it.
    if item_id:
        item_obj = ItemDetails.objects.filter(pk=item_id).first()
        if item_obj is None:
            return Response(
                {"detail": "This item no longer exists."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # Only SURRENDERED items (things someone turned in) can be claimed;
        # a Lost report is a request for help, not an item the SAO holds.
        if item_obj.type != "Surrendered":
            return Response(
                {"detail": "Only surrendered items can be claimed.", "item_unavailable": True},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if item_obj.status != "Approved":
            return Response(
                {
                    "detail": "This item is no longer available to claim. It may have already been claimed by its owner.",
                    "item_unavailable": True,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    # -------------------------------------------------
    # BLOCK DUPLICATE CLAIMS — EXPIRY-AWARE
    #
    # A "Pending" or "Scheduled" claim only blocks a new submission
    # while it's still ACTIVE: either it has no meeting slot yet (still
    # awaiting staff review), or its scheduled slot's end time hasn't
    # passed. Once a scheduled meeting's time has come and gone, this
    # claimant is free to submit a new claim for the same item — the
    # old claim stays in the database as history, it just no longer
    # counts against the duplicate guard.
    #
    # Uses get_active_claim(), the same rule check_claim_status and
    # check_item_claim use.
    # -------------------------------------------------
    # A claimant whose claim on this item was already DECLINED by staff
    # can't claim it again (the public board also hides the item from
    # them).
    if (
        item_id
        and claimant_email
        and Claim.objects.filter(
            item_id=item_id,
            claimant_email__iexact=str(claimant_email).strip(),
            status__in=["Declined", "Declined"],
        ).exists()
    ):
        return Response(
            {
                "detail": "Your previous claim for this item was declined, so you can't claim it again. Please visit the Student Affairs Office if you have questions."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # -------------------------------------------------
    # NO-SHOWS (see claim/noshow.py)
    # 3 missed meetings on this item -> claim in person only.
    # A missed meeting -> use Re-claim (keeps the original answers)
    # instead of a fresh claim with new answers.
    # -------------------------------------------------
    mark_timed_out_claims()
    if item_id and claimant_email:
        if online_claim_blocked(item_id, claimant_email):
            return Response(
                {"detail": BLOCKED_MESSAGE, "online_claim_blocked": True},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Claim.objects.filter(
            item_id=item_id,
            claimant_email__iexact=str(claimant_email).strip(),
            status=TIMED_OUT,
        ).exists():
            return Response(
                {
                    "detail": "You missed your meeting for this item. Please use Re-claim in My Claim Requests to pick a new date and time.",
                    "use_reclaim": True,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    existing_claim = get_active_claim(item_id, claimant_email)

    if existing_claim:
        return Response(
            {
                "detail": "You already submitted a claim request for this item."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    serializer = ClaimSerializer(data=data)

    if serializer.is_valid():
        claim = serializer.save()

        # Answers that don't match what staff recorded on the item are
        # flagged for manual Approve/Decline in Claim Requests.
        claim.needs_manual_review = not _answers_match_item(claim.item, data)
        claim.save(update_fields=["needs_manual_review"])

        # Bell notification for admins & moderators.
        notify_staff_new_claim(claim, actor=request.user)

        # A new claim always starts as "Pending", even when the claimant
        # picked a preferred meeting date/time. Only staff's "Confirm
        # Schedule" action (schedule_meeting below) moves it to
        # "Scheduled". staff_scheduled also stays False here — a
        # claimant picking their own slot is NOT a staff confirmation.
        if claim.meeting_date and claim.meeting_time:
            claim.status = "Pending"
            claim.save(update_fields=["status"])

        staff_emails = list(
            User.objects.filter(
                role__in=["admin", "moderator"],
                is_archived=False,
                email__isnull=False,
            )
            .exclude(email="")
            .values_list("email", flat=True)
        )

        if staff_emails:
            try:
                send_mail(
                    "New Claim Request Submitted",
                    f"""
A new claim request has been submitted.

Item: {claim.item.title}
Claimant: {claim.claimant_name}

Preferred Date: {claim.meeting_date}
Preferred Time: {claim.meeting_time}

Proof:
{claim.proof_description}
""",
                    settings.DEFAULT_FROM_EMAIL,
                    staff_emails,
                    fail_silently=False,
                )
            except Exception as e:
                print(e)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["PUT"])
@permission_classes([IsAuthenticated, IsStaffMember])
def schedule_meeting(request, pk):

    claim = get_object_or_404(Claim.objects.select_related("item"), pk=pk)

    # A declined, closed or released claim is finished; scheduling it used
    # to quietly turn it back into "Scheduled".
    if claim.status in FINISHED_CLAIM_STATUSES:
        return Response(
            {"detail": f"This claim is already {FINISHED_STATUS_WORDS[claim.status]}, so it can't be scheduled."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if str(getattr(claim.item, "status", "") or "") in ("Claimed", "Archived"):
        return Response(
            {"detail": f"This item is already {claim.item.status.lower()}, so no meeting can be scheduled for it."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    meeting_date = request.data.get("meeting_date")
    meeting_time = request.data.get("meeting_time")

    # A schedule confirmation without a date/time would just wipe the
    # claim's meeting fields and leave it looking "Pending Review".
    if not meeting_date or not meeting_time:
        return Response(
            {"detail": "Both meeting_date and meeting_time are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # A past date would turn the claim into a missed meeting ("Timed Out")
    # straight away and count against the claimant.
    try:
        parsed_meeting_date = datetime.strptime(str(meeting_date)[:10], "%Y-%m-%d").date()
    except ValueError:
        return Response({"detail": "Invalid meeting date."}, status=status.HTTP_400_BAD_REQUEST)
    from django.utils import timezone as _tz
    if parsed_meeting_date < _tz.localdate():
        return Response(
            {"detail": "The meeting date can't be in the past."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Saturdays: 8 AM - 11 AM only. Sundays: no meetings.
    slot_error = slot_error_for(meeting_date, meeting_time)
    if slot_error:
        return Response({"detail": slot_error}, status=status.HTTP_400_BAD_REQUEST)

    claim.meeting_date = meeting_date
    claim.meeting_time = meeting_time
    claim.meeting_location = "Student Affairs Office"

    # New/changed schedule -> send a fresh reminder at its start time.
    claim.reminder_sent_at = None

    # This endpoint is IsStaffMember-gated, so there's no legitimate
    # caller here that isn't staff confirming a meeting — default to
    # True if the key is somehow missing from the payload, rather than
    # silently leaving it False. Dashboard.jsx's ClaimScheduleCalendar
    # (isStaffConfirmedSchedule) only lights up a day when this is True.
    claim.staff_scheduled = _as_bool(request.data.get("staff_scheduled"), default=True)

    # Manual review is finished once staff confirm a meeting.
    # ClaimRequests.jsx sends needs_manual_review: false from send();
    # only touch the field when it's actually in the payload.
    if "needs_manual_review" in request.data:
        claim.needs_manual_review = _as_bool(request.data.get("needs_manual_review"))

    # Permanent record that staff approved a claim whose answers were
    # flagged as a mismatch. Only ever set to True here — a later
    # reschedule that doesn't send the flag must not erase the record.
    if _as_bool(request.data.get("staff_approved_despite_mismatch")):
        claim.staff_approved_despite_mismatch = True

    # IMPORTANT
    claim.status = "Scheduled"

    claim.save()

    # In-app notification for the claimant.
    notify_claim_scheduled(claim)

    # Skipped when the claimant switched School Email off in the app.
    if claim.claimant_email and email_allowed(claim.claimant_email):
        try:
            send_mail(
                "Claim Verification Meeting Scheduled",
                f"""
Hello {claim.claimant_name},

Your verification meeting has been scheduled.

Location: Student Affairs Office
Date: {meeting_date}
Time: {meeting_time}

Please bring your School ID.

- Student Affairs Office
""",
                settings.DEFAULT_FROM_EMAIL,
                [claim.claimant_email],
                fail_silently=False,
            )
        except Exception as e:
            print(e)

    return Response(
        {
            "message": "Meeting scheduled successfully.",
            "claim": ClaimSerializer(
                claim,
                context={
                    "request": request,
                    "include_item_description": True,
                },
            ).data,
        }
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsStaffMember])
def decline_claim(request, pk):
    """
    Staff-only: rejects a claim outright (the "Decline" button in
    ClaimRequests.jsx's Review modal, used on claims whose answers were
    flagged as a mismatch).

    The status is ALWAYS set to "Rejected" here — the request body is
    ignored — so a client can't use this endpoint to set an arbitrary
    status. ClaimRequests.jsx's isDeclined() checks for "Rejected",
    dropping the claim from both tables.

    A rejected claim no longer counts as "Pending"/"Scheduled", so the
    duplicate-claim guard in create_claim lets that claimant submit a
    fresh claim for the same item if they need to.
    """
    claim = get_object_or_404(Claim, pk=pk)

    # Already finished: declining would wrongly email "declined" to someone
    # whose claim was closed, or who already received the item.
    if claim.status in FINISHED_CLAIM_STATUSES:
        return Response(
            {"detail": f"This claim is already {FINISHED_STATUS_WORDS[claim.status]}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    claim.status = "Declined"
    # "Not the Owner" button vs the normal Decline (ClaimRequests.jsx).
    claim.not_owner = _as_bool(request.data.get("not_owner"))
    from django.utils import timezone as _tz
    claim.declined_at = _tz.now()
    claim.save(update_fields=["status", "not_owner", "declined_at"])

    # In-app notification for the claimant.
    notify_claim_declined(claim)

    # Email the claimant that their claim was declined. A mail failure
    # never blocks the decline itself, and the email is skipped when
    # the claimant switched School Email off.
    #
    # "Not the Owner" sends NO email: staff already told the claimant in
    # person at the verification meeting.
    if not claim.not_owner:
        try:
            if email_allowed(claim.claimant_email):
                send_claim_declined_notification(claim)
        except Exception as e:
            print(e)

    return Response(
        {
            "message": "Claim declined.",
            "claim": ClaimSerializer(
                claim,
                context={
                    "request": request,
                    "include_item_description": True,
                },
            ).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def check_claim_status(request, item_id):
    """
    Does this email have an ACTIVE claim on this item?

    Uses get_active_claim(), the same rule as create_claim and
    check_item_claim, and also returns the schedule and status so a
    client can show them straight from this one response.
    """
    # Students/employees can only ask about their OWN claims; before, anyone
    # could look up any email's claim and meeting schedule.
    email = request.GET.get("email")
    if not IsStaffMember().has_permission(request, None):
        email = request.user.email

    claim = get_active_claim(item_id, email)

    if not claim:
        return Response({"claimed": False})

    return Response({
        "claimed": True,
        "meeting_date": claim.meeting_date,
        "meeting_time": claim.meeting_time,
        "status": claim.status,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def check_item_claim(request, item_id):
    """
    Reports whether the CURRENTLY AUTHENTICATED claimant — not just
    anyone — has an ACTIVE claim on this item, and that claim's
    schedule.

    Scoped to request.user.email and uses get_active_claim(), so it
    always agrees with create_claim and check_claim_status: a
    Rejected/Cancelled/Completed claim never blocks, a
    still-pending-review claim (no slot yet) always blocks, and a claim
    with a meeting date blocks through that whole day.
    """
    blocking_claim = get_active_claim(item_id, request.user.email)

    if blocking_claim:
        return Response({
            "has_claim": True,
            "meeting_date": blocking_claim.meeting_date,
            "meeting_time": blocking_claim.meeting_time,
            "status": blocking_claim.status,
        })

    return Response({"has_claim": False})


# -------------------------------------------------------------------
# ANSWER VERIFICATION (Used by ClaimModal.jsx's live pre-submission check)
# -------------------------------------------------------------------

def _normalize(value):
    return str(value or "").strip().lower()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_answers(request, item_id):
    """
    Compares the claimant's submitted answers against this item's
    admin-recorded correct answers and returns ONLY a boolean summary
    ({"all_correct": true|false}) — never the correct answers
    themselves, so nothing here can be used to reverse-engineer them
    from the network tab.

    Mirrors getRecordedAnswer() in ClaimRequests.jsx: checks
    verification_answer_N first, then correct_answer_N as a fallback.
    Comparison is case-insensitive / whitespace-trimmed, matching the
    normalize() used there for staff-side comparison.

    A question with no recorded correct answer on the item (neither
    field set, or the question slot itself isn't configured) is
    treated as automatically satisfied — there's nothing to check it
    against, so it can't fail the claimant.

    NOTE: field names verification_answer_N / correct_answer_N are
    assumed to match ItemDetails as guessed in ClaimRequests.jsx.
    Confirm against the actual model before relying on this in
    production.
    """
    item = get_object_or_404(ItemDetails, pk=item_id)

    all_correct = True

    for n in range(1, 5):
        question = getattr(item, f"verification_question_{n}", None)
        if not question or not str(question).strip():
            continue  # this question slot isn't configured on the item

        recorded = (
            getattr(item, f"verification_answer_{n}", None)
            or getattr(item, f"correct_answer_{n}", None)
        )

        if recorded is None or str(recorded).strip() == "":
            continue  # nothing recorded to check this one against

        submitted = request.data.get(f"answer_{n}", "")

        if _normalize(recorded) != _normalize(submitted):
            all_correct = False
            break

    return Response({"all_correct": all_correct}, status=status.HTTP_200_OK)


# -------------------------------------------------------------------
# MY CLAIMS (logged-in claimant's own claims)
# -------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_claims(request):
    # Case-insensitive so a claim saved as e.g. "23100806@SLC-SFLU.EDU.PH"
    # still belongs to this account. The public board uses these claims to
    # hide Surrendered items this user was declined / marked "Not the
    # Owner" for, so a mismatch here would let them see and re-claim it.
    mark_timed_out_claims()
    claims = Claim.objects.filter(
        claimant_email__iexact=(request.user.email or "").strip()
    ).order_by("-claim_date")

    serializer = ClaimSerializer(
        claims,
        many=True,
        context={"request": request}
    )

    return Response({"claims": serializer.data})


# -------------------------------------------------------------------
# RE-CLAIM AFTER A MISSED MEETING (see claim/noshow.py)
#
# POST claim/reclaim/<pk>/  {meeting_date, meeting_time}
#
# The claimant only picks a new date and time. Everything else — name,
# contact, the ownership questions and answers — is copied from the
# timed-out claim, so the answers can't be changed (data integrity).
# The new claim starts as Pending and goes back to staff for review.
# -------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reclaim_claim(request, pk):
    from datetime import date as date_cls, timedelta

    mark_timed_out_claims()
    old = get_object_or_404(Claim.objects.select_related("item"), pk=pk)

    user_email = (request.user.email or "").strip().lower()
    if (old.claimant_email or "").strip().lower() != user_email:
        return Response(
            {"detail": "You can only re-claim your own claim."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if old.status != TIMED_OUT:
        return Response(
            {"detail": "Only a claim whose meeting was missed can be re-claimed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    item = old.item
    if str(item.status or "").strip().lower() in ("claimed", "returned", "archived"):
        return Response(
            {"detail": "This item is no longer available to claim."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if online_claim_blocked(item.id, old.claimant_email):
        return Response(
            {"detail": BLOCKED_MESSAGE, "online_claim_blocked": True},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if Claim.objects.filter(
        item_id=item.id,
        claimant_email__iexact=old.claimant_email.strip(),
        status__in=["Declined", "Declined"],
    ).exists():
        return Response(
            {"detail": "Your previous claim for this item was declined, so you can't claim it again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if Claim.objects.filter(
        item_id=item.id,
        claimant_email__iexact=old.claimant_email.strip(),
        claim_date__gt=old.claim_date,
    ).exists() or get_active_claim(item.id, old.claimant_email):
        return Response(
            {"detail": "You already have a newer claim for this item."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ---- New date and time (same rules as a first claim) ----
    meeting_date_raw = str(request.data.get("meeting_date") or "").strip()
    meeting_time = str(request.data.get("meeting_time") or "").strip()
    if not meeting_date_raw or not meeting_time:
        return Response(
            {"detail": "Please pick a meeting date and time."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        meeting_date = datetime.strptime(meeting_date_raw[:10], "%Y-%m-%d").date()
    except ValueError:
        return Response({"detail": "Invalid meeting date."}, status=status.HTTP_400_BAD_REQUEST)

    if meeting_date < date_cls.today():
        return Response(
            {"detail": "Meeting date cannot be in the past."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    slot_error = slot_error_for(meeting_date, meeting_time)
    if slot_error:
        return Response({"detail": slot_error}, status=status.HTTP_400_BAD_REQUEST)
    if item.start_date:
        earliest = (item.end_date or item.start_date) + timedelta(days=1)
        if meeting_date < earliest:
            return Response(
                {"detail": "The meeting date must be after the date this item was surrendered/found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    new_claim = Claim.objects.create(
        item=item,
        claimant_name=old.claimant_name,
        claimant_contact=old.claimant_contact,
        claimant_email=old.claimant_email,
        proof_description=old.proof_description,
        meeting_date=meeting_date,
        meeting_time=meeting_time,
        meeting_location="Student Affairs Office",
        status="Pending",
        question_1=old.question_1, answer_1=old.answer_1,
        question_2=old.question_2, answer_2=old.answer_2,
        question_3=old.question_3, answer_3=old.answer_3,
        question_4=old.question_4, answer_4=old.answer_4,
        other_description=old.other_description,
        needs_manual_review=old.needs_manual_review,
        staff_approved_despite_mismatch=old.staff_approved_despite_mismatch,
        reclaim_of=old,
    )

    # Bell notification for admins & moderators.
    notify_staff_new_claim(new_claim, actor=request.user, reclaim=True)

    missed = Claim.objects.filter(
        item_id=item.id,
        claimant_email__iexact=old.claimant_email.strip(),
        status=TIMED_OUT,
        staff_scheduled=True,
    ).count()

    staff_emails = list(
        User.objects.filter(
            role__in=["admin", "moderator"],
            is_archived=False,
            email__isnull=False,
        )
        .exclude(email="")
        .values_list("email", flat=True)
    )
    if staff_emails:
        try:
            send_mail(
                "Re-claim Request Submitted",
                f"""
A claimant who missed their meeting has re-claimed an item.

Item: {item.title}
Claimant: {new_claim.claimant_name}
Missed meetings so far: {missed}

New Date: {new_claim.meeting_date}
New Time: {new_claim.meeting_time}

The ownership answers are the same as the original claim.
""",
                settings.DEFAULT_FROM_EMAIL,
                staff_emails,
                fail_silently=True,
            )
        except Exception as e:
            print(e)

    return Response(
        ClaimSerializer(new_claim, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )
