"""
CLAIM SCHEDULE EMAIL REMINDERS

Sends the claimant an email reminder at the exact START of their claim
verification meeting. Example: a claim scheduled on October 5 at
"9:00 AM - 10:00 AM" gets its reminder email at 9:00 AM on October 5.

How it runs:
  - claim/apps.py starts a small background scheduler when the Django
    server starts. It wakes up at the start of every minute and calls
    send_due_reminders().
  - `python manage.py send_claim_reminders` does the same check once,
    for use with Windows Task Scheduler / cron on a production server.

Each claim is reminded only once (Claim.reminder_sent_at). If the
server was off at 9:00 AM, the reminder is still sent as soon as it
comes back, as long as the meeting slot has not ended yet. When staff
reschedule a claim, reminder_sent_at is cleared so the new schedule
gets its own reminder.
"""
import logging
import re
from datetime import datetime, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Claim

logger = logging.getLogger(__name__)

# Claims in these statuses never get a reminder.
NO_REMINDER_STATUSES = ("Declined", "Rejected", "Completed", "Claimed", "Cancelled")

TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", re.IGNORECASE)


def _parse_time(label):
    match = TIME_RE.match((label or "").strip())
    if not match:
        return None
    hours, minutes, meridiem = int(match.group(1)), int(match.group(2)), match.group(3).upper()
    if meridiem == "PM" and hours != 12:
        hours += 12
    if meridiem == "AM" and hours == 12:
        hours = 0
    return hours, minutes


def meeting_slot(claim):
    """
    Returns (start, end) as timezone-aware datetimes for the claim's
    meeting, e.g. "9:00 AM - 10:00 AM" on 2026-10-05 ->
    (2026-10-05 09:00, 2026-10-05 10:00). None if it can't be parsed.
    """
    if not claim.meeting_date or not claim.meeting_time:
        return None

    parts = str(claim.meeting_time).split("-")
    start_hm = _parse_time(parts[0])
    if not start_hm:
        return None
    end_hm = _parse_time(parts[1]) if len(parts) == 2 else None

    day = claim.meeting_date
    if isinstance(day, str):
        day = datetime.strptime(day[:10], "%Y-%m-%d").date()

    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, datetime.min.time()).replace(
        hour=start_hm[0], minute=start_hm[1]), tz)
    if end_hm:
        end = timezone.make_aware(datetime.combine(day, datetime.min.time()).replace(
            hour=end_hm[0], minute=end_hm[1]), tz)
    else:
        end = start + timedelta(hours=1)
    if end <= start:
        end = start + timedelta(hours=1)
    return start, end


def _email_allowed(email):
    # Respect the claimant's "School Email" notification setting.
    try:
        from alerts.services import email_allowed
        return email_allowed(email)
    except Exception:
        return True


def send_reminder_email(claim):
    item_title = getattr(claim.item, "title", "your item")
    location = claim.meeting_location or "Student Affairs Office"
    date_label = claim.meeting_date.strftime("%B %d, %Y") if hasattr(claim.meeting_date, "strftime") else claim.meeting_date

    send_mail(
        "Reminder: Your Claim Verification Meeting Is Now",
        f"""
Hello {claim.claimant_name},

This is a reminder that your claim verification meeting is starting now.

Item: {item_title}
Date: {date_label}
Time: {claim.meeting_time}
Location: {location}

Please proceed to the {location} and bring your School ID.
If you can no longer attend, please contact the Student Affairs Office.

- Seek & Balik, Student Affairs Office
""",
        settings.DEFAULT_FROM_EMAIL,
        [claim.claimant_email],
        fail_silently=False,
    )


def send_due_reminders(now=None):
    """
    Sends every reminder that is due right now. Returns how many were sent.
    Safe to call as often as you like; each claim is only emailed once.
    """
    now = now or timezone.now()
    today = timezone.localtime(now).date()

    # Also mark missed meetings as "Timed Out" (see noshow.py).
    try:
        from .noshow import mark_timed_out_claims
        mark_timed_out_claims(today)
    except Exception:
        logger.exception("Could not mark timed-out claims")

    candidates = (
        Claim.objects.select_related("item")
        .filter(
            meeting_date=today,
            reminder_sent_at__isnull=True,
        )
        .exclude(meeting_time__isnull=True)
        .exclude(meeting_time="")
        .exclude(status__in=NO_REMINDER_STATUSES)
        .exclude(claimant_email="")
    )

    sent = 0
    for claim in candidates:
        slot = meeting_slot(claim)
        if not slot:
            continue
        start, end = slot
        if not (start <= now < end):
            continue  # not 9:00 yet, or the meeting is already over

        # Claim it atomically so two server processes never both send.
        if not Claim.objects.filter(pk=claim.pk, reminder_sent_at__isnull=True).update(
            reminder_sent_at=now
        ):
            continue

        if not _email_allowed(claim.claimant_email):
            continue  # marked as handled; user turned school email off

        try:
            send_reminder_email(claim)
            sent += 1
            logger.info("Sent claim reminder for claim %s to %s", claim.pk, claim.claimant_email)
        except Exception:
            # Undo the mark so the next minute tries again (until the slot ends).
            Claim.objects.filter(pk=claim.pk).update(reminder_sent_at=None)
            logger.exception("Could not send claim reminder for claim %s", claim.pk)

    return sent
