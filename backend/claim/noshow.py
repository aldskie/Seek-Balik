"""
NO-SHOW / SESSION TIMED OUT RULE

A claim whose meeting day has passed without staff marking the item as
Claimed (released) or the claim as Not the Owner / Declined becomes
"Timed Out" — the claimant did not show up.

  - The claimant can RE-CLAIM the same item from My Claim Requests: they
    only pick a new date and time; their original ownership answers are
    copied onto the new claim (data integrity — no new guesses).
  - Staff see "Missed N previous meeting(s)" on the new claim.
  - After MAX_MISSED_MEETINGS no-shows on the same item, the student can
    no longer claim it online and must go to the Student Affairs Office
    in person.

mark_timed_out_claims() runs every minute from the reminder scheduler
(claim/scheduler.py) and also at the start of the claim views, so the
status is correct even if the scheduler isn't running.
"""
from django.utils import timezone

from .models import Claim

TIMED_OUT = "Timed Out"
MAX_MISSED_MEETINGS = 3

# Claims in these statuses are still "open" and can time out.
OPEN_STATUSES = ("Pending", "Scheduled", "Approved")

# Item statuses meaning the item was already handed over.
RELEASED_ITEM_STATUSES = ("Claimed",)


def mark_timed_out_claims(today=None):
    """
    Marks a claim Timed Out (a missed meeting) ONLY when an Admin or
    Moderator had confirmed the meeting with "Continue to Schedule"
    (staff_scheduled=True) and that meeting day has passed.

    A claim the staff never scheduled is NOT a no-show: the date on it is
    just the claimant's requested slot, so it stays Pending for staff to
    review and schedule, and never counts toward the 3-missed-meetings limit.
    """
    today = today or timezone.localdate()
    return (
        Claim.objects.filter(
            status__in=OPEN_STATUSES,
            staff_scheduled=True,
            meeting_date__lt=today,
        )
        .exclude(item__status__in=RELEASED_ITEM_STATUSES)
        .update(status=TIMED_OUT)
    )


def missed_meetings(item_id, email, exclude_pk=None):
    """How many of this claimant's claims on this item timed out."""
    if not item_id or not email:
        return 0
    qs = Claim.objects.filter(
        item_id=item_id,
        claimant_email__iexact=str(email).strip(),
        status=TIMED_OUT,
        # Only meetings staff actually confirmed count as missed.
        staff_scheduled=True,
    )
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return qs.count()


def online_claim_blocked(item_id, email):
    return missed_meetings(item_id, email) >= MAX_MISSED_MEETINGS


BLOCKED_MESSAGE = (
    f"You missed {MAX_MISSED_MEETINGS} meetings for this item, so you can no "
    "longer claim it online. Please go to the Student Affairs Office in person."
)
