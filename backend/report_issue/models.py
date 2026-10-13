from django.conf import settings
from django.db import models


class ReportIssue(models.Model):
    CATEGORY_CHOICES = [
        ("Bug", "Bug"),
        ("Account", "Account"),
        ("Item Post", "Item Post"),
        ("Claim", "Claim"),
        ("Suggestion", "Suggestion"),
        ("Other", "Other"),
    ]

    PRIORITY_CHOICES = [
        ("Low", "Low"),
        ("Medium", "Medium"),
        ("High", "High"),
    ]

    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("In Progress", "In Progress"),
        ("Resolved", "Resolved"),
        ("Dismissed", "Dismissed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reported_issues",
    )

    subject = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="Other")
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="Medium")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Pending")

    screenshot = models.ImageField(upload_to="report_issues/", null=True, blank=True)
    device_info = models.CharField(max_length=255, blank=True, default="")
    app_version = models.CharField(max_length=50, blank=True, default="")

    admin_notes = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.status}] {self.subject}"
