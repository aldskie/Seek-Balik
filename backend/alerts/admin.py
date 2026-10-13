from django.contrib import admin

from .models import Notification, NotificationPreference, PushToken


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "account", "kind", "is_read", "created_at")
    list_filter = ("kind", "is_read")
    search_fields = ("title", "body", "account__email")


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("account", "push_enabled", "email_enabled", "updated_at")
    search_fields = ("account__email",)


@admin.register(PushToken)
class PushTokenAdmin(admin.ModelAdmin):
    list_display = ("account", "platform", "updated_at")
    search_fields = ("account__email", "token")
