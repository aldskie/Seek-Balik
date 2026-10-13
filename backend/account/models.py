from django.utils import timezone
from django.db import models
from django.contrib.auth.models import AbstractUser


class Account(AbstractUser):
    ROLE_CHOICES = [
        ("admin", "Admin"),
        ("moderator", "Moderator"),
        ("student", "Student"),
        ("employee", "Employee"),   # NEW
    ]

    # Login email
    email = models.EmailField(unique=True)

    # Contact number
    contact_number = models.CharField(max_length=20, blank=True, null=True)

    # User role
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="student"
    )

    # Account status
    is_archived = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=False)

    # NEW — temporary password issued by admin
    has_temporary_password = models.BooleanField(default=False)

    # When the emailed temporary password was issued. Changing it is
    # optional at login ("Later"), but it only works for
    # TEMP_PASSWORD_VALID_DAYS (account/views.py); after that the user must
    # use Forgot Password. Cleared once the user sets their own password.
    temp_password_issued_at = models.DateTimeField(null=True, blank=True)

    # TERMS AND DATA PRIVACY CONSENT — which version of the terms this
    # account agreed to, and when. Blank / null means the user has not
    # agreed yet. Set at registration (_record_registration_consent) or by
    # accept_terms() in views.py; compared with TERMS_VERSION there, so
    # raising that constant asks everyone again.
    terms_version_accepted = models.CharField(max_length=20, blank=True, default="")
    terms_accepted_at = models.DateTimeField(null=True, blank=True)

    # NEW — gates login until the school-ID email is confirmed via a
    # 6-digit code (see EmailVerificationCode + verify_email() in
    # views.py). Defaults True so staff-created accounts (admin/
    # moderator/employee, created via get_user()/update_user()) are
    # unaffected — only the public register() flow ever sets this
    # False, and only verify_email() flips it back to True.
    is_verified = models.BooleanField(default=True)

    # NEW — a self-registered student who has verified their email code
    # and been emailed a temporary password, but has NOT yet logged in
    # with that temporary password. While True the account is NOT a
    # "registered user": it is hidden from the Users list (see
    # get_user() in views.py). verify_email() sets it True; the first
    # successful login() clears it. Defaults False so every existing
    # and staff-created account stays visible.
    is_pending_activation = models.BooleanField(default=False)

    # LOGIN LOCKOUT (see login() in views.py): wrong passwords in a row,
    # and until when login is blocked. Reset on a successful login or a
    # password reset.
    failed_login_attempts = models.PositiveIntegerField(default=0)
    login_locked_until = models.DateTimeField(null=True, blank=True)

    # NEW — tracks which ONE admin is currently "the" admin, separate
    # from is_active. is_active is forced True for every admin below (an
    # admin must always be able to log in); is_current_admin is what the
    # single-admin swap logic in views.py actually flips.
    #
    # IMPORTANT: never set is_active=False on an admin anywhere in this
    # codebase. Doing so fights the rule directly below (is_active is
    # forced True whenever role == "admin" is saved) and produces an
    # account stuck as role="admin", is_active=False — a state this model
    # says is invalid, and one that permanently locks that admin out of
    # login, since login() rejects is_active=False before authenticate()
    # ever runs. This was a real bug that shipped here previously.
    #
    # NOTE: the model default is True, so views that create/promote an
    # admin must set this explicitly (see _mark_admin_pending() in
    # views.py).
    is_current_admin = models.BooleanField(default=True)

    # NEW — a newly added / promoted admin who has NOT logged in yet.
    # While True, the previous admin stays is_current_admin=True. The
    # swap happens in login() (see _activate_if_pending_admin() in
    # views.py) the first time this account logs in successfully.
    # Only one admin can be pending at a time.
    is_pending_admin = models.BooleanField(default=False)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        """
        SEEK & BALIK ACCOUNT RULES

        ✔ Email is always username.
        ✔ Only ONE admin account is the CURRENT admin at a time —
          enforced via is_current_admin, NEVER is_active. Every admin
          account can always log in; is_current_admin just decides which
          one the UI treats as "the" active admin.
        ✔ A newly added/promoted admin is PENDING (is_pending_admin)
          until they log in. The previous admin stays current until
          then; the swap happens at that first login.
        ✔ Superuser is always admin.

        NOTE: Single-admin swap enforcement happens in views.py:
        _mark_admin_pending() runs when an admin is created/promoted,
        and _activate_if_pending_admin() runs on login and calls
        _deactivate_other_admins(), which updates is_current_admin
        (not is_active) on every other admin. Do NOT force
        is_current_admin or is_pending_admin here in save() — unlike
        is_active and is_archived below, their correct values depend
        on WHY save() is being called (new admin vs. an unrelated field
        edit vs. the swap itself), which this method has no way to
        know. That decision belongs in the view layer.
        """

        # Username always mirrors email
        if self.email:
            self.email = self.email.lower().strip()
            self.username = self.email

        # Django superuser is forced admin
        if self.is_superuser:
            self.role = "admin"

        if self.role == "admin":
            # Admins are never archived. The current admin and a pending
            # (newly added) admin are always active. A PREVIOUS admin who
            # was replaced keeps is_active=False — set by the handover in
            # views.py (_deactivate_other_admins) when the new admin
            # logs in for the first time.
            self.is_archived = False
            if self.is_current_admin or self.is_pending_admin:
                self.is_active = True

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.role})"

    # Convenience properties
    @property
    def is_admin(self):
        return self.role == "admin"

    @property
    def is_moderator(self):
        return self.role == "moderator"

    @property
    def is_student(self):
        return self.role == "student"

    @property
    def is_employee(self):
        return self.role == "employee"


class PasswordResetCode(models.Model):
    """
    One-time 6-digit code emailed to an account owner during
    "Forgot password?". Only a HASH of the code is stored (never the
    code itself), the same way Django stores passwords.

    Lifecycle (see password_reset_request / password_reset_confirm in
    views.py):
      - Requesting a code deletes any earlier codes for that account, so
        only the newest code is ever valid.
      - A code expires at `expires_at` and is dead after `attempts`
        wrong guesses, so a 6-digit code can't be brute-forced.
      - A code that has been used successfully is marked `used` and can
        never be reused.
    """

    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name="password_reset_codes",
    )
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Password reset code for {self.account.email} ({self.created_at:%Y-%m-%d %H:%M})"


class EmailVerificationCode(models.Model):
    """
    One-time 6-digit code emailed after public self-registration
    (register() in views.py), before the account is usable.

    Same lifecycle pattern as PasswordResetCode:
      - Only a HASH of the code is stored.
      - Requesting/resending a code deletes any earlier codes for that
        account, so only the newest is ever valid.
      - A code expires at `expires_at` and is dead after `attempts`
        wrong guesses.
      - A code that has been used successfully is marked `used` and can
        never be reused.

    While no unused, unexpired row exists for an account (or the
    account's is_verified is False and no code was ever sent), that
    account cannot log in — see the is_verified check in login().
    """

    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name="email_verification_codes",
    )
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Email verification code for {self.account.email} ({self.created_at:%Y-%m-%d %H:%M})"