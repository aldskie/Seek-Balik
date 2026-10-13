from django.conf import settings
from django.db import models


class Notification(models.Model):
    """One in-app notification shown in an account's notifications list."""

    KIND_CHOICES = [
        ("lost_report_approved", "Lost report approved"),
        ("lost_report_declined", "Lost report declined"),
        ("claim_scheduled", "Claim meeting scheduled"),
        ("claim_declined", "Claim declined"),
        ("claim_closed", "Claim closed"),
        ("item_claimed_points", "Surrendered item claimed"),
        ("issue_status", "Issue report status changed"),
        # Staff (admin / moderator) notifications — web bell.
        ("new_claim", "New claim request"),
        ("new_lost_report", "New lost item report"),
        ("new_issue_report", "New issue report"),
    ]

    account = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alerts",
    )
    kind = models.CharField(max_length=40, choices=KIND_CHOICES)
    title = models.CharField(max_length=120)
    body = models.TextField(blank=True)
    # Extra details for the app, e.g. {"item_id": 5, "screen": "MySubmissions"}.
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["account", "is_read"])]

    def __str__(self):
        return f"{self.title} -> {self.account.email}"


class NotificationPreference(models.Model):
    """The Push Alerts / School Email switches on the Profile screen."""

    account = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alert_preference",
    )
    push_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Notification preferences for {self.account.email}"


class PushToken(models.Model):
    """One phone that can receive real push notifications for an account."""

    account = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_tokens",
    )
    # Expo push token, e.g. "ExponentPushToken[xxxxxxxx]". One row per phone.
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=20, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.account.email} ({self.platform or 'unknown'})"
