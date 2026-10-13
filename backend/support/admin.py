from django.contrib import admin

from .models import IssueReport


@admin.register(IssueReport)
class IssueReportAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "category", "status", "account", "created_at")
    list_filter = ("status", "category")
    search_fields = ("subject", "description", "account__email")
