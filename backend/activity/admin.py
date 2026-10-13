from django.contrib import admin

from .models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor_name", "actor_role", "action", "target_title")
    list_filter = ("action", "actor_role")
    search_fields = ("actor_name", "target_title", "details")
    # An audit trail: read-only in the Django admin too.
    readonly_fields = [f.name for f in ActivityLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
