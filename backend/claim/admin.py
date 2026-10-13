from django.contrib import admin

from .models import AvailableSchedule, BlockedSlot, Claim


@admin.register(Claim)
class ClaimAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "claimant_name",
        "item",
        "status",
        "meeting_date",
        "meeting_time",
        "staff_scheduled",
        "not_owner",
        "claim_date",
    )
    list_display_links = ("id", "claimant_name")
    list_filter = (
        "status",
        "staff_scheduled",
        "needs_manual_review",
        "staff_approved_despite_mismatch",
        "not_owner",
        "meeting_date",
    )
    search_fields = (
        "claimant_name",
        "claimant_email",
        "claimant_contact",
        "item__title",
    )
    date_hierarchy = "claim_date"
    ordering = ("-claim_date",)
    list_select_related = ("item",)
    raw_id_fields = ("item", "reclaim_of")
    # Set by the system, not typed in by hand: claim_date (auto_now_add),
    # reminder_sent_at (claim/reminders.py) and declined_at (decline_claim
    # in views.py).
    readonly_fields = ("claim_date", "reminder_sent_at", "declined_at")

    # Same groups as the Claim model, so every field is easy to find.
    fieldsets = (
        (
            "Claim",
            {"fields": ("item", "status", "claim_date", "reclaim_of")},
        ),
        (
            "Claimant",
            {"fields": ("claimant_name", "claimant_contact", "claimant_email")},
        ),
        (
            "Ownership details",
            {
                "fields": (
                    "proof_description",
                    ("question_1", "answer_1"),
                    ("question_2", "answer_2"),
                    ("question_3", "answer_3"),
                    ("question_4", "answer_4"),
                    "other_description",
                )
            },
        ),
        (
            "Meeting",
            {
                "fields": (
                    "meeting_date",
                    "meeting_time",
                    "meeting_location",
                    "reminder_sent_at",
                )
            },
        ),
        (
            "Staff review",
            {
                "fields": (
                    "needs_manual_review",
                    "staff_scheduled",
                    "staff_approved_despite_mismatch",
                    "not_owner",
                    "declined_at",
                )
            },
        ),
    )


@admin.register(AvailableSchedule)
class AvailableScheduleAdmin(admin.ModelAdmin):
    list_display = ("date", "time_slot", "is_active")
    list_filter = ("is_active", "date")
    search_fields = ("time_slot",)
    ordering = ("date", "time_slot")


@admin.register(BlockedSlot)
class BlockedSlotAdmin(admin.ModelAdmin):
    list_display = ("date", "slot_label", "reason", "created_by", "created_at")
    list_filter = ("date",)
    search_fields = ("reason", "created_by", "time_slot")
    date_hierarchy = "date"
    ordering = ("date", "time_slot")
    readonly_fields = ("created_at",)
    fields = ("date", "time_slot", "reason", "created_by", "created_at")

    # An empty time_slot means the whole day is disabled (see the model),
    # so the list says so instead of showing a blank cell.
    @admin.display(description="Time slot", ordering="time_slot")
    def slot_label(self, obj):
        return obj.time_slot or "Whole day"

    # A slot disabled from the Django admin records who did it, like the
    # Manage Slots calendar does, unless "created by" was typed in.
    def save_model(self, request, obj, form, change):
        if not obj.created_by and request.user.is_authenticated:
            full_name = request.user.get_full_name().strip()
            obj.created_by = full_name or request.user.get_username()
        super().save_model(request, obj, form, change)