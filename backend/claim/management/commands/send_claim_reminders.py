from django.core.management.base import BaseCommand

from claim.reminders import send_due_reminders


class Command(BaseCommand):
    help = (
        "Emails claimants whose verification meeting is starting now. "
        "The server already does this every minute; this command is for "
        "running it from Windows Task Scheduler or cron instead."
    )

    def handle(self, *args, **options):
        sent = send_due_reminders()
        self.stdout.write(self.style.SUCCESS(f"Sent {sent} claim reminder email(s)."))
