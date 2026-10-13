from django.conf import settings
from django.db import models
from django.utils import timezone


class ActivityLog(models.Model):
    """
    One line on the Activity Logs page (Utilities): who did what, to what,
    and when.

    Logs used to be kept only in each person's browser (localStorage), so
    the admin only saw actions done on their own computer, clearing the
    browser erased them, and anyone could edit them. They are now saved
    here, on the server. Entries can't be edited or deleted through the
    API (activity/views.py).
    """

    # The id the website gave the entry (e.g. "log_1728631234_ab12cd3").
    # Lets old browser logs and backups be imported only once.
    client_id = models.CharField(max_length=64, unique=True, null=True, blank=True)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_logs",
    )
    actor_name = models.CharField(max_length=150, blank=True, default="")
    actor_role = models.CharField(max_length=30, blank=True, default="")
    # Role of the logged-in account that performed the action.
    performed_by_role = models.CharField(max_length=30, blank=True, default="")

    action = models.CharField(max_length=40)
    target_title = models.CharField(max_length=255, blank=True, default="")
    details = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.actor_name} {self.action} {self.target_title}"
