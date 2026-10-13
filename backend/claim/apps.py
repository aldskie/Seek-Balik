from django.apps import AppConfig


class ClaimConfig(AppConfig):
    name = 'claim'

    def ready(self):
        # Emails each claimant at the start of their meeting time
        # (see claim/reminders.py).
        from .scheduler import start
        start()
