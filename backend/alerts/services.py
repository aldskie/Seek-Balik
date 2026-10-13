import functools
import json
import logging
import threading
import urllib.request

from django.contrib.auth import get_user_model

from .models import Notification, NotificationPreference, PushToken

logger = logging.getLogger(__name__)

# Student account emails look like 12345678@slc-sflu.edu.ph.
STUDENT_EMAIL_DOMAIN = "slc-sflu.edu.ph"

# Expo's push service; it forwards each message to Android (FCM) or iOS (APNs).
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_TIMEOUT_SECONDS = 10

# Only these roles get real push. Admins and moderators are in-app only.
PUSH_ROLES = ("student", "employee")

# Issue report statuses (report_issue.models.ReportIssue.STATUS_CHOICES).
ISSUE_STATUS_LABELS = {
    "Pending": "Pending",
    "In Progress": "In Progress",
    "Resolved": "Resolved",
    "Dismissed": "Dismissed",
}


def _safe(func):
    # A notification problem must never break the action that triggered it.
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception:
            logger.exception("Could not create notification in %s", func.__name__)
            return None

    return wrapper


def find_account(email=None, student_id=None):
    # Finds the account by its email, or by the email built from a Student ID.
    Account = get_user_model()
    addresses = []

    if email and str(email).strip():
        addresses.append(str(email).strip())
    if student_id and str(student_id).strip():
        addresses.append(f"{str(student_id).strip()}@{STUDENT_EMAIL_DOMAIN}")

    for address in addresses:
        account = Account.objects.filter(
            email__iexact=address, is_archived=False
        ).first()
        if account:
            return account

    return None


def get_preference(account):
    preference, _ = NotificationPreference.objects.get_or_create(account=account)
    return preference


def email_allowed(email):
    # False only when this email belongs to an account that switched School Email off.
    try:
        account = find_account(email=email)
        if not account:
            return True
        preference = NotificationPreference.objects.filter(account=account).first()
        return preference.email_enabled if preference else True
    except Exception:
        logger.exception("Could not read the email preference for %s", email)
        return True


def notify(account, kind, title, body="", data=None):
    # Saves one notification; does nothing when no account matched.
    if account is None:
        return None

    notification = Notification.objects.create(
        account=account,
        kind=kind,
        title=title,
        body=body,
        data=data or {},
    )

    send_push(notification)

    return notification


def send_push(notification):
    # Sends the notification to the account's phones, if push applies to them.
    try:
        account = notification.account

        if account.role not in PUSH_ROLES:
            return

        preference = NotificationPreference.objects.filter(account=account).first()
        if preference and not preference.push_enabled:
            return

        tokens = list(account.push_tokens.values_list("token", flat=True))
        if not tokens:
            return

        messages = [
            {
                "to": token,
                "title": notification.title,
                "body": notification.body,
                "sound": "default",
                "channelId": "default",
                "data": {
                    **notification.data,
                    "notification_id": notification.id,
                    "kind": notification.kind,
                },
            }
            for token in tokens
        ]

        # Sent on a background thread so the staff action is not slowed down.
        threading.Thread(target=_deliver_push, args=(messages,), daemon=True).start()
    except Exception:
        logger.exception("Could not queue push for notification %s", notification.id)


def _deliver_push(messages):
    # Posts the messages to Expo and removes tokens for uninstalled apps.
    try:
        request = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(messages).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=EXPO_PUSH_TIMEOUT_SECONDS) as response:
            result = json.loads(response.read().decode("utf-8"))

        tickets = result.get("data", [])
        if not isinstance(tickets, list):
            return

        dead_tokens = [
            message["to"]
            for message, ticket in zip(messages, tickets)
            if ticket.get("status") == "error"
            and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
        ]

        if dead_tokens:
            PushToken.objects.filter(token__in=dead_tokens).delete()
    except Exception:
        logger.exception("Could not deliver push notifications")


@_safe
def notify_lost_report_reviewed(item, old_status):
    # Tells the reporter their Lost report was approved or declined.
    if item.type != "Lost" or item.status == old_status:
        return None
    # Restoring from the Archive page is not a new review decision.
    if old_status == "Archived":
        return None
    if item.status not in ("Approved", "Declined"):
        return None

    account = find_account(
        email=getattr(item, "email", None),
        student_id=getattr(item, "student_id", None),
    )
    data = {
        "item_id": item.id,
        "ticket_code": item.ticket_code,
        "screen": "MySubmissions",
    }

    if item.status == "Approved":
        return notify(
            account,
            "lost_report_approved",
            "Lost report approved",
            f'Your report for "{item.title}" is now visible on the board.',
            data,
        )

    remarks = (getattr(item, "declined_remarks", "") or "").strip()
    body = f'Your report for "{item.title}" was declined.'
    if remarks:
        body += f" Reason: {remarks}"

    return notify(account, "lost_report_declined", "Lost report declined", body, data)


@_safe
def notify_surrendered_item_claimed(item, points):
    # Tells the finder that the item they surrendered was claimed.
    account = find_account(student_id=getattr(item, "student_id", None))

    return notify(
        account,
        "item_claimed_points",
        "Your surrendered item was claimed",
        f'"{item.title}" was returned to its owner. You earned {points} bonus points.',
        {"item_id": item.id, "points": points},
    )


@_safe
def notify_claim_scheduled(claim):
    # Tells the claimant their verification meeting is confirmed.
    account = find_account(email=claim.claimant_email)

    return notify(
        account,
        "claim_scheduled",
        "Verification meeting scheduled",
        f'Your claim for "{claim.item.title}" is scheduled on '
        f"{claim.meeting_date}, {claim.meeting_time} at the "
        f"{claim.meeting_location}. Please bring your School ID.",
        {"claim_id": claim.id, "item_id": claim.item_id, "screen": "MyClaimRequests"},
    )


@_safe
def notify_claim_declined(claim):
    # Tells the claimant their claim request was declined.
    account = find_account(email=claim.claimant_email)

    return notify(
        account,
        "claim_declined",
        "Claim request declined",
        f'Your claim for "{claim.item.title}" was declined. '
        "You may visit the Student Affairs Office if you have questions.",
        {"claim_id": claim.id, "item_id": claim.item_id, "screen": "MyClaimRequests"},
    )


@_safe
def notify_claim_closed(claim):
    # Tells a claimant the item went to its verified owner (claim/closing.py).
    account = find_account(email=claim.claimant_email)

    return notify(
        account,
        "claim_closed",
        "Claim request closed",
        f'"{claim.item.title}" was released to its verified owner, so your claim '
        "for it is closed. Visit the Student Affairs Office if you believe it is yours.",
        {"claim_id": claim.id, "item_id": claim.item_id, "screen": "MyClaimRequests"},
    )


@_safe
def notify_issue_status(report, old_status):
    # Tells the reporter their issue report moved to a new status.
    if report.status == old_status:
        return None

    # The reporter is report.user (this used to read report.account, which
    # doesn't exist, so the notice silently failed every time).
    if report.user is None:
        return None

    label = ISSUE_STATUS_LABELS.get(report.status, report.status)

    return notify(
        report.user,
        "issue_status",
        "Issue report updated",
        f'Your report "{report.subject}" is now marked as {label}.',
        {"report_id": report.id, "status": report.status},
    )



# -------------------------------------------------------------------
# STAFF NOTIFICATIONS (admin / moderator bell on the web dashboard)
#
# `data.path` is the dashboard page the bell opens when clicked.
# The staff member who did the action is never notified about it.
# -------------------------------------------------------------------

STAFF_ROLES = ("admin", "moderator")


def staff_accounts(roles=STAFF_ROLES, exclude=None):
    Account = get_user_model()
    accounts = Account.objects.filter(role__in=roles, is_archived=False, is_active=True)
    if exclude is not None and getattr(exclude, "pk", None):
        accounts = accounts.exclude(pk=exclude.pk)
    return accounts


def notify_staff(kind, title, body="", data=None, roles=STAFF_ROLES, exclude=None):
    return [notify(account, kind, title, body, data) for account in staff_accounts(roles, exclude)]


@_safe
def notify_staff_new_claim(claim, actor=None, reclaim=False):
    # A claimant submitted (or re-submitted) a claim request.
    who = claim.claimant_name or claim.claimant_email or "A claimant"
    title = "Re-claim request submitted" if reclaim else "New claim request"
    body = f'{who} wants to claim "{claim.item.title}".'
    if claim.meeting_date and claim.meeting_time:
        body += f" Requested meeting: {claim.meeting_date}, {claim.meeting_time}."
    return notify_staff(
        "new_claim",
        title,
        body,
        {"claim_id": claim.id, "item_id": claim.item_id, "path": "/dashboard/claim-requests"},
        exclude=actor,
    )


@_safe
def notify_staff_new_lost_report(item, actor=None):
    # Someone reported a lost item that needs review.
    if item.type != "Lost":
        return None
    who = getattr(item, "poster_name", "") or getattr(item, "email", "") or "Someone"
    return notify_staff(
        "new_lost_report",
        "New lost item report",
        f'{who} reported "{item.title}" as lost. Ticket {item.ticket_code}.',
        {"item_id": item.id, "ticket_code": item.ticket_code, "path": "lost-items"},
        exclude=actor,
    )


@_safe
def notify_staff_new_issue(report, actor=None):
    # A user filed an issue report (Report Issues page is admin-only).
    return notify_staff(
        "new_issue_report",
        "New issue report",
        f'"{report.subject}" was reported.',
        {"report_id": report.id, "path": "/dashboard/utilities/report-issues"},
        roles=("admin",),
        exclude=actor,
    )
