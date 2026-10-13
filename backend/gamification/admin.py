from django.contrib import admin

from .models import LeaderboardPlayer, PointTransaction, LeaderboardSettings


class PointTransactionInline(admin.TabularInline):
    model = PointTransaction
    extra = 0
    fields = ("reason", "item_id", "points", "created_at")
    readonly_fields = ("created_at",)


@admin.register(LeaderboardPlayer)
class LeaderboardPlayerAdmin(admin.ModelAdmin):
    list_display = ("student_id", "full_name", "points")
    search_fields = ("student_id", "full_name")
    ordering = ("-points",)
    inlines = [PointTransactionInline]


@admin.register(PointTransaction)
class PointTransactionAdmin(admin.ModelAdmin):
    list_display = ("player", "reason", "item_id", "points", "created_at")
    list_filter = ("reason",)
    search_fields = ("player__student_id", "player__full_name", "item_id")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)


@admin.register(LeaderboardSettings)
class LeaderboardSettingsAdmin(admin.ModelAdmin):
    list_display = ("id", "is_active", "auto_mode", "open_date", "close_date", "updated_at")
