from django.contrib import admin

from .models import ReportIssue


@admin.register(ReportIssue)
class ReportIssueAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "user", "category", "priority", "status", "created_at")
    list_filter = ("status", "category", "priority")
    search_fields = ("subject", "description", "user__email", "user__first_name", "user__last_name")
