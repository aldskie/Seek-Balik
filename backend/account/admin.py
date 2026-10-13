from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Account, PasswordResetCode, EmailVerificationCode


@admin.register(Account)
class AccountAdmin(BaseUserAdmin):
    """Shows the real Seek & Balik users (the same ones the React Users page lists)."""

    list_display = (
        "id",
        "email",
        "first_name",
        "last_name",
        "role",
        "contact_number",
        "is_active",
        "is_current_admin",
        "is_pending_admin",
        "is_superuser",
        "is_archived",
        "is_verified",
        "created_at",
        "terms_version_accepted",
        "terms_accepted_at",
    )
    list_filter = ("role", "is_active", "is_archived", "is_verified", "is_staff")
    search_fields = ("email", "first_name", "last_name", "contact_number")
    ordering = ("-created_at",)

    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "Seek & Balik",
            {
                "fields": (
                    "role",
                    "contact_number",
                    "is_archived",
                    "must_change_password",
                    "has_temporary_password",
                    "is_verified",
                    "is_pending_activation",
                    "is_current_admin",
                    "is_pending_admin",
                )
            },
        ),
        (
            # Clear these to unlock an account early (see LOGIN LOCKOUT
            # in views.py).
            "Login lockout",
            {"fields": ("failed_login_attempts", "login_locked_until")},
        ),
    )

    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        (
            "Seek & Balik",
            {"fields": ("email", "first_name", "last_name", "role", "contact_number")},
        ),
    )


@admin.register(PasswordResetCode)
class PasswordResetCodeAdmin(admin.ModelAdmin):
    list_display = ("account", "created_at", "expires_at", "attempts", "used")
    list_filter = ("used",)
    search_fields = ("account__email",)


@admin.register(EmailVerificationCode)
class EmailVerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("account", "created_at", "expires_at", "attempts", "used")
    list_filter = ("used",)
    search_fields = ("account__email",)
