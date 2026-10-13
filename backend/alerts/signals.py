# Creates the staff notifications automatically whenever a new lost report,
# claim or issue report is saved, so items/views.py, claim/views.py and
# support/views.py need no notification code for them.
from django.db.models.signals import post_save
from django.dispatch import receiver

from .services import (
    notify_staff_new_claim,
    notify_staff_new_issue,
    notify_staff_new_lost_report,
)


@receiver(post_save, sender="items.ItemDetails")
def item_created(sender, instance, created, **kwargs):
    # Only brand-new items; the helper keeps just Pending Lost reports.
    if created:
        notify_staff_new_lost_report(instance)


@receiver(post_save, sender="claim.Claim")
def claim_created(sender, instance, created, **kwargs):
    # A claim made through Re-claim points back at the missed claim.
    if created:
        is_reclaim = getattr(instance, "reclaim_of_id", None) is not None
        notify_staff_new_claim(instance, reclaim=is_reclaim)


@receiver(post_save, sender="support.IssueReport")
def issue_created(sender, instance, created, **kwargs):
    if created:
        notify_staff_new_issue(instance)
