"""
CLOSE OTHER CLAIMS WHEN AN ITEM IS RELEASED

Several students can claim the same surrendered item. When staff mark
the item "Claimed" (released), every other open claim on it is closed
with status "Closed", and each of those claimants gets an in-app notice
and an email saying the item was released to its verified owner.

The claimant who received the item is matched by the email staff
recorded in the "Mark as Claimed" prompt (item.claimed_by_email); that
claim is left as it is. If no email matches (e.g. a walk-in owner), all
open claims are closed.

Called from item_details() in items/views.py when an item's status
changes to "Claimed".
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

from .models import Claim

logger = logging.getLogger(__name__)

CLOSED = "Closed"
RELEASED = "Released"
# Claims that are still waiting on something and should be closed.
CLOSABLE_STATUSES = ("Pending", "Scheduled", "Approved", "Timed Out")


def mark_receiver_released(item):
    """
    The claimant who actually received the item (item.claimed_by_email):
    every one of their unfinished claims on it - including one that had
    already Timed Out because they came after their meeting day - becomes
    "Released". Their page then shows "You received this item", with no
    Re-claim button, and those misses no longer count as strikes.
    """
    receiver = (getattr(item, "claimed_by_email", "") or "").strip()
    if not receiver:
        return 0
    return Claim.objects.filter(
        item=item,
        claimant_email__iexact=receiver,
        status__in=CLOSABLE_STATUSES,
    ).update(status=RELEASED)


def close_other_claims(item):
    """Closes every open claim on `item` except the receiver's (which is
    marked Released). Returns the closed claims."""
    receiver = (getattr(item, "claimed_by_email", "") or "").strip().lower()
    mark_receiver_released(item)

    to_close = [
        c for c in Claim.objects.filter(item=item, status__in=CLOSABLE_STATUSES)
        if not receiver or (c.claimant_email or "").strip().lower() != receiver
    ]
    if not to_close:
        return []

    Claim.objects.filter(pk__in=[c.pk for c in to_close]).update(status=CLOSED)

    # One notice per claimant (they may have several claims on the item).
    seen = set()
    for claim in to_close:
        email = (claim.claimant_email or "").strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        _notify(claim, item)

    return to_close


def _notify(claim, item):
    try:
        from alerts.services import notify_claim_closed, email_allowed
    except Exception:
        notify_claim_closed = None
        email_allowed = lambda _email: True  # noqa: E731

    if notify_claim_closed:
        notify_claim_closed(claim)

    try:
        if not email_allowed(claim.claimant_email):
            return
        send_mail(
            "Your Claim Request Has Been Closed",
            f"""
Hello {claim.claimant_name},

The item you requested to claim, "{item.title}", has been released to
its verified owner after an ownership verification meeting at the
Student Affairs Office.

Your claim request for this item is now closed, and no further action
is needed from you. If you believe this item is yours, please visit the
Student Affairs Office.

- Seek & Balik, Student Affairs Office
""",
            settings.DEFAULT_FROM_EMAIL,
            [claim.claimant_email],
            fail_silently=True,
        )
    except Exception:
        logger.exception("Could not email closed-claim notice for claim %s", claim.pk)
