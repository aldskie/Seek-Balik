# notification/service.py
from django.core.mail import send_mail
from django.conf import settings


def send_item_notification(item_instance, event="status"):
    """
    Single entry point for every item email.

    event="new_report" -> "your report was submitted" confirmation.
                          Called right after a new item is created via
                          the Report Lost modal. Errors are raised
                          (fail_silently=False), as before.
    event="status"     -> status-change email. Only sends when the item's
                          status is 'Approved', 'Claimed' or 'Declined';
                          any other status sends nothing. Errors are
                          swallowed (fail_silently=True), as before.
    """
    if event not in ("new_report", "status"):
        return

    # Recipient lookup differs slightly per event, same as before.
    if event == "new_report":
        poster_email = getattr(item_instance, 'email', None)
    else:
        poster_email = (
            getattr(item_instance, 'poster_email', None)
            or getattr(item_instance, 'email', None)
        )

    if not poster_email:
        return

    title = getattr(item_instance, 'title', 'Item')
    poster_name = getattr(item_instance, 'poster_name', 'User')
    ticket_code = getattr(item_instance, 'ticket_code', 'N/A')

    if event == "new_report":
        category = getattr(item_instance, 'category', '')
        location = getattr(item_instance, 'location', '')

        subject = f"[Seek & Balik] Lost Item Report Submitted - {ticket_code}"
        message = (
            f"Hello {poster_name},\n\n"
            f"Your lost item report has been successfully submitted.\n\n"
            f"Ticket Code: {ticket_code}\n\n"
            f"Item: {title}\n"
            f"Category: {category}\n"
            f"Location: {location}\n\n"
            f"Status: Pending Review\n\n"
            f"You can use this ticket code to track your report.\n\n"
            f"- SAO Office"
        )
        fail_silently = False

    else:
        status = getattr(item_instance, 'status', '')

        if status == 'Approved':
            subject = f"[Seek & Balik] Item Status Update: {title} - Approved"
            message = (
                f"Hello {poster_name},\n\n"
                f"Your reported item '{title}' has been reviewed and APPROVED.\n"
                f"Ticket Code: {ticket_code}\n\n"
                f"Regards,\nSAO Office - Saint Louis College"
            )
        elif status == 'Claimed':
            subject = f"[Seek & Balik] Item Status Update: {title} - Claimed"
            message = (
                f"Hello {poster_name},\n\n"
                f"Your item '{title}' has been marked as CLAIMED.\n\n"
                f"Regards,\nSAO Office - Saint Louis College"
            )
        elif status == 'Declined':
            remarks = (getattr(item_instance, 'declined_remarks', '') or '').strip()
            subject = f"[Seek & Balik] Item Status Update: {title} - Declined"
            message = (
                f"Hello {poster_name},\n\n"
                f"Your reported item '{title}' has been reviewed and DECLINED.\n"
                f"Ticket Code: {ticket_code}\n\n"
                f"Reason for decline:\n{remarks}\n\n"
                f"Your report is no longer active, but it stays on record and can still be looked up using the ticket code above.\n\n"
                f"Regards,\nSAO Office - Saint Louis College"
            )
        else:
            return

        fail_silently = True

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[poster_email],
        fail_silently=fail_silently,
    )


def send_claim_declined_notification(claim_instance):
    """
    Sends a decline notice to the claimant when their claim request is
    declined. Called from claims/views.py's decline_claim(), right after
    the claim's status is set to "Rejected" and saved.
    """
    claimant_email = getattr(claim_instance, 'claimant_email', None)
    if not claimant_email:
        return

    claimant_name = getattr(claim_instance, 'claimant_name', 'Claimant')
    # Claim.item is a FK to ItemDetails (see claims/serializers.py's
    # get_item_details) — the title lives at claim.item.title, not on
    # the claim itself.
    related_item = getattr(claim_instance, 'item', None)
    item_title = getattr(related_item, 'title', None) or 'the item'

    subject = "[Seek & Balik] Your Claim Request Has Been Declined"
    message = (
        f"Hello {claimant_name},\n\n"
        f"Your claim request for '{item_title}' has been reviewed and DECLINED.\n\n"
        f"If you believe this was a mistake, please visit the SAO Office.\n\n"
        f"Regards,\nSAO Office - Saint Louis College"
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[claimant_email],
        fail_silently=True,
    )


# ---------------------------------------------------------------
# Backward-compatible names. Existing imports elsewhere (e.g. the
# items views) keep working unchanged. Once those call
# send_item_notification() directly, these two can be deleted.
# ---------------------------------------------------------------
def send_item_status_notification(item_instance):
    send_item_notification(item_instance, "status")


def send_new_report_notification(item_instance):
    send_item_notification(item_instance, "new_report")