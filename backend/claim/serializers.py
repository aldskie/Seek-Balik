from datetime import date, datetime, timedelta
from rest_framework import serializers
from .models import Claim, AvailableSchedule, BlockedSlot
from account.serializers import clean_contact_number


# Fixed verification meeting time slots the claimant can choose from on the
# public Claim Modal. Kept identical to the TIME_OPTIONS list staff use in
# ClaimRequests.jsx and the DEFAULT_TIME_OPTIONS list in ClaimModal.jsx, so
# meeting_time values line up everywhere they're displayed.
#
# FIX: last slot previously read "4:00 AM - 5:00 AM", which didn't match
# either frontend's list (both use "4:00 PM - 5:00 PM" for the natural
# 1PM -> 4PM afternoon sequence). Any claimant submission that picked that
# slot failed validate() below with a 400 and was silently never created —
# it never reached Claim Requests, which looked identical to "claims aren't
# updating." Corrected to match.
ALLOWED_MEETING_TIME_SLOTS = [
    "8:00 AM - 9:00 AM",
    "9:00 AM - 10:00 AM",
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "1:00 PM - 2:00 PM",
    "2:00 PM - 3:00 PM",
    "3:00 PM - 4:00 PM",
    "4:00 PM - 5:00 PM",
]

# Saturdays: morning only (8 AM - 11 AM). Sundays: no meetings.
SATURDAY_MEETING_TIME_SLOTS = [
    "8:00 AM - 9:00 AM",
    "9:00 AM - 10:00 AM",
    "10:00 AM - 11:00 AM",
]


def allowed_slots_for_date(day):
    """Meeting time slots allowed on a given date (a date or 'YYYY-MM-DD')."""
    if isinstance(day, str):
        try:
            day = datetime.strptime(day[:10], "%Y-%m-%d").date()
        except ValueError:
            return ALLOWED_MEETING_TIME_SLOTS
    if day is None:
        return ALLOWED_MEETING_TIME_SLOTS
    weekday = day.weekday()  # Monday = 0 ... Sunday = 6
    if weekday == 6:
        return []
    if weekday == 5:
        return SATURDAY_MEETING_TIME_SLOTS
    return ALLOWED_MEETING_TIME_SLOTS


def _as_date(day):
    if isinstance(day, str):
        try:
            return datetime.strptime(day[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    if isinstance(day, datetime):
        return day.date()
    return day


def blocked_slot_for(day, time_slot=None):
    """
    The BlockedSlot that disables this date/time (a whole-day block
    wins over a single-slot block), or None if it's open.
    """
    day = _as_date(day)
    if day is None:
        return None
    blocks = BlockedSlot.objects.filter(date=day)
    whole_day = blocks.filter(time_slot="").first()
    if whole_day:
        return whole_day
    if time_slot:
        return blocks.filter(time_slot=time_slot).first()
    return None


def slot_error_for(day, time_slot):
    """A readable error if this date/time isn't bookable, else None."""
    allowed = allowed_slots_for_date(day)
    if not allowed:
        return "There are no meeting slots on Sundays. Please pick another day."
    if time_slot and time_slot not in allowed:
        if allowed is SATURDAY_MEETING_TIME_SLOTS:
            return "On Saturdays, meetings are only available from 8:00 AM to 11:00 AM."
        return "Please select one of the available time slots."

    # Disabled by staff from the "Manage Slots" calendar.
    block = blocked_slot_for(day, time_slot)
    if block:
        what = "This day is" if block.is_whole_day else "This time slot is"
        reason = f" ({block.reason})" if block.reason else ""
        return f"{what} unavailable for claim meetings{reason}. Please pick another schedule."
    return None


ACTIVE_MEETING_STATUSES = ["Pending", "Scheduled", "Approved"]


def claims_in_block(day, time_slot=""):
    """Unfinished claims whose meeting falls inside this block."""
    qs = Claim.objects.filter(meeting_date=day, status__in=ACTIVE_MEETING_STATUSES)
    if time_slot:
        qs = qs.filter(meeting_time=time_slot)
    return qs


class BlockedSlotSerializer(serializers.ModelSerializer):
    """
    Staff-disabled meeting slots. `affected_claims` (how many booked
    meetings fall in the block) is only filled in for staff — the view
    passes context={"include_affected": True}.
    """

    affected_claims = serializers.SerializerMethodField()

    class Meta:
        model = BlockedSlot
        fields = ["id", "date", "time_slot", "reason", "created_by", "created_at", "affected_claims"]
        read_only_fields = ["created_by", "created_at"]
        # The (date, time_slot) duplicate check is done in validate() with
        # a friendlier message.
        validators = []

    def get_affected_claims(self, obj):
        if not self.context.get("include_affected"):
            return None
        return claims_in_block(obj.date, obj.time_slot).count()

    def validate_date(self, value):
        if value < date.today():
            raise serializers.ValidationError("You can't disable a date in the past.")
        return value

    def validate(self, data):
        day = data.get("date")
        time_slot = (data.get("time_slot") or "").strip()
        data["time_slot"] = time_slot
        data["reason"] = (data.get("reason") or "").strip()

        if time_slot and time_slot not in ALLOWED_MEETING_TIME_SLOTS:
            raise serializers.ValidationError({"time_slot": "Please select one of the meeting time slots."})

        if BlockedSlot.objects.filter(date=day, time_slot="").exists():
            raise serializers.ValidationError({"date": "This whole day is already disabled."})
        if time_slot and BlockedSlot.objects.filter(date=day, time_slot=time_slot).exists():
            raise serializers.ValidationError({"time_slot": "This time slot is already disabled."})
        return data


class AvailableScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailableSchedule
        fields = "__all__"

    def validate_date(self, value):
        if value < date.today():
            raise serializers.ValidationError("Schedule date cannot be in the past.")
        return value

    def validate(self, data):
        error = slot_error_for(data.get("date"), data.get("time_slot"))
        if error:
            raise serializers.ValidationError({"time_slot": error})
        return data


class ClaimSerializer(serializers.ModelSerializer):
    """
    NOTE on `item_details.description`:
    The found item's internal `description` (written by admin/moderator when
    logging the item) is the source of truth used to validate a claimant's
    ownership answers. It must never be shown to the claimant, so it is only
    attached here when the view explicitly marks the request as staff-facing
    via `context={"include_item_description": True}` (see claim/views.py:
    get_claim and schedule_meeting). create_claim never sets that flag, so the
    claimant's own submission response never includes it.

    NOTE on `item_details.verification_answer_N`:
    Same staff-only gating applies to the admin-recorded correct answer for
    each of the 4 ownership verification questions. Without these,
    ClaimRequests.jsx's getRecordedAnswer()/buildAnswerComparison() has
    nothing to compare the claimant's answers against, so a claim can never
    be flagged as a mismatch there. See get_item_details() below.

    NOTE on `staff_scheduled`:
    Set to True only when staff explicitly confirm a meeting through
    ClaimRequests.jsx's Review -> Continue to Schedule -> Confirm Schedule
    flow. This distinguishes a staff-locked-in meeting from a claimant's own
    self-picked slot. Dashboard.jsx's ClaimScheduleCalendar
    (isStaffConfirmedSchedule) only counts claims where this is True.

    NOTE on `staff_approved_despite_mismatch`:
    Set to True by schedule_meeting when staff approved a claim whose answers
    were flagged as a mismatch and then scheduled it anyway. It's returned on
    every claim so ClaimRequests.jsx (isMismatchApproved) keeps seeing it
    after reloads and after the 5s poll.
    """

    item_details = serializers.SerializerMethodField()

    # No-show tracking (see claim/noshow.py).
    missed_meetings = serializers.SerializerMethodField()
    online_claim_blocked = serializers.SerializerMethodField()
    can_reclaim = serializers.SerializerMethodField()

    class Meta:
        model = Claim
        fields = [
            "id",
            "item",
            "item_details",
            "claimant_name",
            "claimant_contact",
            "claimant_email",
            "proof_description",
            "claim_date",
            "meeting_date",
            "meeting_time",
            "meeting_location",
            "status",
            "question_1",
            "answer_1",
            "question_2",
            "answer_2",
            "question_3",
            "answer_3",
            "question_4",
            "answer_4",
            "other_description",
            "needs_manual_review",
            "staff_scheduled",
            "staff_approved_despite_mismatch",
            "reclaim_of",
            "not_owner",
            "declined_at",
            "missed_meetings",
            "online_claim_blocked",
            "can_reclaim",
        ]
        read_only_fields = ["reclaim_of", "not_owner", "declined_at"]
        # Contact number is optional on a claim.
        extra_kwargs = {
            "claimant_contact": {"required": False, "allow_blank": True},
        }

    def validate_claimant_contact(self, value):
        # Same 11-digit rule as account contact numbers.
        return clean_contact_number(value)

    # ------------------------------------------------------------------
    # NO-SHOW FIELDS
    # missed_meetings: this claimant's OTHER timed-out claims on the same
    #   item ("Missed 1 previous meeting" in ClaimRequests.jsx).
    # online_claim_blocked: 3+ no-shows on this item -> must go to the
    #   Student Affairs Office in person.
    # can_reclaim: this is a timed-out claim, it's the claimant's newest
    #   claim on the item, the item isn't released, and not blocked.
    # ------------------------------------------------------------------
    def get_missed_meetings(self, obj):
        from .noshow import missed_meetings
        return missed_meetings(obj.item_id, obj.claimant_email, exclude_pk=obj.pk)

    def get_online_claim_blocked(self, obj):
        from .noshow import online_claim_blocked
        return online_claim_blocked(obj.item_id, obj.claimant_email)

    def get_can_reclaim(self, obj):
        from .noshow import TIMED_OUT, online_claim_blocked
        if obj.status != TIMED_OUT:
            return False
        item_status = str(getattr(obj.item, "status", "") or "").strip().lower()
        if item_status in ("claimed", "returned", "archived"):
            return False
        if online_claim_blocked(obj.item_id, obj.claimant_email):
            return False
        newer = Claim.objects.filter(
            item_id=obj.item_id,
            claimant_email__iexact=(obj.claimant_email or "").strip(),
            claim_date__gt=obj.claim_date,
        ).exists()
        return not newer

    def get_item_details(self, obj):
        item = obj.item
        if not item:
            return None

        data = {
            "id": item.id,
            "title": item.title,
            "category": item.category,
            "location": item.location,
            "type": item.type,
            "status": item.status,
        }

        if self.context.get("include_item_description"):
            data["description"] = item.description

            # Staff-only: the admin-recorded correct answer for each
            # ownership verification question, so ClaimRequests.jsx's
            # getRecordedAnswer()/buildAnswerComparison() can actually
            # flag a mismatch instead of always seeing `null`. Never
            # exposed on the claimant-facing response — create_claim()
            # never sets include_item_description, so this block never
            # runs for the claimant's own submission.
            #
            # Same getattr fallback as verify_answers() in views.py:
            # tries verification_answer_N first, then correct_answer_N.
            #
            # ASSUMPTION: confirm these are ItemDetails' real field
            # names — update both here and in verify_answers() together
            # if the model uses something else.
            for n in range(1, 5):
                recorded = (
                    getattr(item, f"verification_answer_{n}", None)
                    or getattr(item, f"correct_answer_{n}", None)
                )
                data[f"verification_answer_{n}"] = recorded

        return data

    # ------------------------------------------------------------------
    # ClaimModal.jsx submits meeting_date/meeting_time as "" (empty
    # string) for a pending-review claim with no claimant-picked slot
    # yet — not omitted, not null, literally "". DRF's DateField only
    # treats an actually-missing key or an explicit None as "not set";
    # an empty string fails field-level parsing before validate() or
    # validate_meeting_date() ever runs, so the whole request 400s and
    # the claim is never created. Normalize both fields here, before
    # DRF's own field parsing, so a blank string is treated the same as
    # "not provided" instead of "invalid date".
    # ------------------------------------------------------------------
    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)

        if data.get("meeting_date") == "":
            data["meeting_date"] = None
        if data.get("meeting_time") == "":
            data["meeting_time"] = None

        return super().to_internal_value(data)

    def validate_meeting_date(self, value):
        if value and value < date.today():
            raise serializers.ValidationError("Meeting date cannot be in the past.")
        return value

    def validate(self, data):
        """
        The claimant now picks any calendar date on the public Claim
        Modal (same freeform date input used on the Report Lost form) —
        it no longer has to match a staff-preset AvailableSchedule slot.
        Two rules still apply instead: the time must be one of the fixed
        daily slots, and the date must fall strictly after the date this
        item was surrendered/found.

        Both rules only apply once a meeting_date/meeting_time is
        actually present — a pending-review claim (mismatched/unverified
        answers) intentionally submits neither, and that's valid.

        (Staff-preset AvailableSchedule slots still exist and are used
        by ClaimRequests.jsx when staff confirm the final meeting time —
        this validate() only governs the claimant's initial submission.)
        """
        meeting_date = data.get("meeting_date")
        meeting_time = data.get("meeting_time")
        item = data.get("item")

        if meeting_time and meeting_time not in ALLOWED_MEETING_TIME_SLOTS:
            raise serializers.ValidationError({
                "meeting_time": "Please select one of the available time slots."
            })

        if meeting_date:
            error = slot_error_for(meeting_date, meeting_time)
            if error:
                raise serializers.ValidationError({"meeting_time": error})

        if meeting_date and item and item.start_date:
            # Measured from the END of the lost/found range when one was
            # given, otherwise from its start.
            last_known_date = item.end_date or item.start_date
            earliest_allowed = last_known_date + timedelta(days=1)
            if meeting_date < earliest_allowed:
                raise serializers.ValidationError({
                    "meeting_date": (
                        "The verification meeting date must be after the date "
                        "this item was surrendered/found."
                    )
                })

        return data