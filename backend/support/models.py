from django.conf import settings
from django.db import models


class IssueReport(models.Model):
    """
    An issue a user reports from the app (Support > Report an Issue).

    The status values match alerts.services.ISSUE_STATUS_LABELS
    ("open" / "in_review" / "resolved"), so notify_issue_status() can tell
    the reporter when an admin moves their report along.
    """

    CATEGORY_CHOICES = [
        ("bug", "Bug / Error"),
        ("account", "Account"),
        ("item_post", "Item Post"),
        ("claim", "Claim"),
        ("suggestion", "Suggestion"),
        ("other", "Other"),
    ]

    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_review", "In review"),
        ("resolved", "Resolved"),
    ]

    account = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="issue_reports",
    )
    subject = models.CharField(max_length=150)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="other")
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.get_status_display()}] {self.subject}"
