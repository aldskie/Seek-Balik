import re
import logging
from datetime import timedelta

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken

from django.contrib.auth import authenticate
from django.contrib.auth.hashers import make_password, check_password
from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string

from .models import Account, PasswordResetCode, EmailVerificationCode
from .serializers import (
    AccountSerializer,
    AccountLoginSerializer,
    AccountLogoutSerializer,
)

logger = logging.getLogger(__name__)

# School ID email: 1-8 digits followed by @slc-sflu.edu.ph.
SCHOOL_EMAIL_REGEX = re.compile(
    r"^\d{1,8}@slc-sflu\.edu\.ph$",
    re.IGNORECASE
)

# Forgot-password code settings.
PASSWORD_RESET_CODE_LENGTH = 6
PASSWORD_RESET_TTL_MINUTES = 10
PASSWORD_RESET_MAX_ATTEMPTS = 5
PASSWORD_RESET_RESEND_SECONDS = 60

# Email-verification code settings for self-registration.
EMAIL_VERIFICATION_CODE_LENGTH = 6
EMAIL_VERIFICATION_TTL_MINUTES = 10
EMAIL_VERIFICATION_MAX_ATTEMPTS = 5
EMAIL_VERIFICATION_RESEND_SECONDS = 60

# Only these fields can be changed by a user on their own account via PATCH account/current/.
SELF_EDITABLE_FIELDS = {"first_name", "last_name", "contact_number"}

# Characters used for generated temporary passwords (no look-alikes such as O/0 or l/1).
TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*"

# Changing the emailed temporary password is optional at login, but the
# temporary password itself only works for this many days. After that the
# login asks the user to set a new one with Forgot Password.
TEMP_PASSWORD_VALID_DAYS = 7

# Version of the Terms and Conditions and Data Privacy Consent that users
# must agree to. Raise it whenever the terms text changes in a way users
# must agree to again: every account is then asked once more, because its
# saved terms_version_accepted no longer matches. Keep it equal to
# TERMS_VERSION in the mobile app (hooks/TermsConsent.js) and the website
# (frontend/src/components/TermsConsentModal.jsx).
TERMS_VERSION = "1"


# =========================================================
# SINGLE-ADMIN HELPERS
# =========================================================
# Only one admin is current at a time. A newly created admin stays PENDING
# (the previous admin keeps full access) until the new admin logs in for the
# first time. At that moment the handover happens:
#   - the new admin becomes the current admin AND the Django-admin superuser
#     (is_staff / is_superuser), and
#   - every previous admin is DISABLED: is_active, is_staff and is_superuser
#     are turned off, and their saved logins are revoked, so they are signed
#     out of both the system and the Django admin site.

def _grant_django_admin(account):
    """The current admin is also the Django admin (database admin) user."""
    account.is_staff = True
    account.is_superuser = True


def _revoke_sessions(account_ids):
    """Blacklist saved refresh tokens so displaced admins are signed out."""
    try:
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
            OutstandingToken,
        )
    except Exception:  # token_blacklist app not installed
        return
    for token in OutstandingToken.objects.filter(user_id__in=account_ids):
        BlacklistedToken.objects.get_or_create(token=token)


def _deactivate_other_admins(keep_account):
    # Makes keep_account the only admin: every other admin is disabled and
    # loses Django-admin access. .update() is used on purpose so
    # Account.save() can't switch is_active back on.
    others = Account.objects.filter(role="admin").exclude(pk=keep_account.pk)
    other_ids = list(others.values_list("pk", flat=True))
    others.update(
        is_current_admin=False,
        is_pending_admin=False,
        is_active=False,
        is_staff=False,
        is_superuser=False,
    )
    _revoke_sessions(other_ids)


def _mark_admin_pending(account):
    # New admin becomes pending if another admin is current, otherwise current right away.
    with transaction.atomic():
        other_current_exists = (
            Account.objects.filter(role="admin", is_current_admin=True)
            .exclude(pk=account.pk)
            .exists()
        )

        if other_current_exists:
            # Only one admin can be pending, so the newest replaces any earlier one.
            Account.objects.filter(
                role="admin", is_pending_admin=True
            ).exclude(pk=account.pk).update(is_pending_admin=False)

            account.is_current_admin = False
            account.is_pending_admin = True
        else:
            _deactivate_other_admins(account)
            account.is_current_admin = True
            account.is_pending_admin = False
            _grant_django_admin(account)

        # A pending admin can log in but is not a Django admin yet.
        if account.is_pending_admin:
            account.is_staff = False
            account.is_superuser = False

        account.is_active = True
        account.save(update_fields=[
            "is_current_admin", "is_pending_admin", "is_active", "is_staff", "is_superuser",
        ])


def _activate_if_pending_admin(account):
    # On login, a pending admin becomes the current admin and displaces the previous one.
    if account.role != "admin" or not account.is_pending_admin:
        return

    with transaction.atomic():
        _deactivate_other_admins(account)
        account.is_current_admin = True
        account.is_pending_admin = False
        _grant_django_admin(account)
        account.save(update_fields=[
            "is_current_admin", "is_pending_admin", "is_staff", "is_superuser",
        ])


# =========================================================
# CREATE ACCOUNT HELPER (STAFF-CREATED ACCOUNTS)
# =========================================================
# Used when staff add a user: emails the temporary password at once and skips email verification.
def _create_account_helper(request_data, forced_role=None):
    data = request_data.copy()

    generated_password = get_random_string(12, allowed_chars=TEMP_PASSWORD_CHARS)

    # No password supplied: use the generated one and force a change at first login.
    if not data.get("password"):
        data["password"] = generated_password
        data["must_change_password"] = True

    if not data.get("username"):
        data["username"] = data.get("email")

    if forced_role:
        data["role"] = forced_role

    serializer = AccountSerializer(data=data)

    if serializer.is_valid():
        account = serializer.save()

        if account.must_change_password:
            account.temp_password_issued_at = timezone.now()
            account.save(update_fields=["temp_password_issued_at"])

        # A new admin waits as pending while another admin is still current.
        if account.role == "admin":
            _mark_admin_pending(account)

        full_name = f"{account.first_name} {account.last_name}".strip()

        email_sent = True
        email_error = None

        if account.must_change_password:
            subject = "Your SLC Seek & Balik Account Password"

            message = f"""
Hello {full_name},

Your Seek & Balik account has been created.

Email:
{account.email}

Temporary Password:
{generated_password}

Please login immediately and change your password.

Student Affairs Office
Saint Louis College
"""

            try:
                send_mail(
                    subject,
                    message,
                    settings.DEFAULT_FROM_EMAIL,
                    [account.email],
                    fail_silently=False,
                )
            except Exception as e:
                email_sent = False
                email_error = str(e)
                print("Welcome email failed:", e)

        response_data = AccountSerializer(account).data
        response_data["email_sent"] = email_sent

        if email_error:
            response_data["email_error"] = email_error

        return Response(response_data, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# =========================================================
# EMAIL VERIFICATION HELPER
# =========================================================
def _send_verification_code(account):
    # Creates a new hashed 6-digit code, deletes older ones, emails it; returns (email_sent, email_error).
    now = timezone.now()
    code = get_random_string(
        EMAIL_VERIFICATION_CODE_LENGTH, allowed_chars="0123456789"
    )

    with transaction.atomic():
        EmailVerificationCode.objects.filter(account=account).delete()
        EmailVerificationCode.objects.create(
            account=account,
            code_hash=make_password(code),
            created_at=now,
            expires_at=now + timedelta(minutes=EMAIL_VERIFICATION_TTL_MINUTES),
        )

    full_name = f"{account.first_name} {account.last_name}".strip() or "there"

    subject = "Verify your Seek & Balik account"
    message = f"""
Hello {full_name},

Thanks for registering with Seek & Balik.

Your verification code:
{code}

Enter this code in the app to activate your account. This code expires
in {EMAIL_VERIFICATION_TTL_MINUTES} minutes and can only be used once.

If you didn't create this account, you can ignore this email.

Student Affairs Office
Saint Louis College
"""

    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [account.email],
            fail_silently=False,
        )
        return True, None
    except Exception as e:
        logger.exception("Verification email failed for %s", account.email)
        return False, str(e)


# =========================================================
# TERMS CONSENT GIVEN AT REGISTRATION
# =========================================================
# The registration form shows the Terms and Data Privacy Consent first and
# sends the version the user agreed to as `accepted_terms_version` (the
# website also sends `agreed_to_terms: true`). When it is the current
# TERMS_VERSION, the consent is saved on the new account, so the user is
# not asked again at login. A request without it (e.g. a client that has
# not been updated yet) still registers; that user is asked to agree at
# their first login instead.
def _record_registration_consent(account, request):
    version = str(request.data.get("accepted_terms_version") or "").strip()
    agreed = str(request.data.get("agreed_to_terms", "")).lower() in ("true", "1", "yes")

    if version != TERMS_VERSION and not (agreed and not version):
        return
    if account.terms_version_accepted == TERMS_VERSION:
        return

    account.terms_version_accepted = TERMS_VERSION
    account.terms_accepted_at = timezone.now()
    account.save(update_fields=["terms_version_accepted", "terms_accepted_at"])


# =========================================================
# PUBLIC REGISTER (STEP 1: CREATE UNVERIFIED ACCOUNT + SEND CODE)
# =========================================================
# Creates the account unverified and emails a 6-digit code; login stays blocked until verify_email().
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):

    email = (request.data.get("email") or "").strip().lower()
    first_name = (request.data.get("first_name") or "").strip()
    last_name = (request.data.get("last_name") or "").strip()

    if not SCHOOL_EMAIL_REGEX.match(email):
        return Response(
            {
                "email": [
                    "Use your School ID email (23100094@slc-sflu.edu.ph)."
                ]
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Name is required so no account can be created with only an ID number.
    if not first_name or not last_name:
        return Response(
            {
                "detail": "First name and last name are required to register.",
                "first_name": [] if first_name else ["This field is required."],
                "last_name": [] if last_name else ["This field is required."],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Re-registering an unverified account updates its details and sends a new code instead of failing.
    existing = Account.objects.filter(email__iexact=email).first()

    if existing is not None and not existing.is_verified and not existing.is_archived:
        updates = {"first_name": first_name, "last_name": last_name}
        contact_number = (request.data.get("contact_number") or "").strip()
        if contact_number:
            updates["contact_number"] = contact_number

        update_serializer = AccountSerializer(existing, data=updates, partial=True)
        if not update_serializer.is_valid():
            return Response(
                update_serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )
        existing = update_serializer.save()
        _record_registration_consent(existing, request)

        # A code sent in the last 60 seconds is still valid, so no new one is sent.
        recently_sent = EmailVerificationCode.objects.filter(
            account=existing,
            created_at__gte=timezone.now()
            - timedelta(seconds=EMAIL_VERIFICATION_RESEND_SECONDS),
        ).exists()

        email_sent, email_error = True, None
        if not recently_sent:
            email_sent, email_error = _send_verification_code(existing)

        response_data = {
            "email": existing.email,
            "message": (
                "We've emailed a 6-digit code to verify your school ID address."
            ),
            "email_sent": email_sent,
        }
        if email_error:
            response_data["email_error"] = email_error

        return Response(response_data, status=status.HTTP_200_OK)

    # Brand-new registration; verified accounts fail below with the serializer's "already exists" error.
    data = request.data.copy()
    data["email"] = email
    data["username"] = email
    data["role"] = "student"
    data["first_name"] = first_name
    data["last_name"] = last_name

    # Throwaway password nobody is told; the real one is emailed after verification.
    data["password"] = get_random_string(20)
    data["must_change_password"] = True

    serializer = AccountSerializer(data=data)

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    account = serializer.save()
    account.is_verified = False
    account.save(update_fields=["is_verified"])
    _record_registration_consent(account, request)

    email_sent, email_error = _send_verification_code(account)

    response_data = {
        "email": account.email,
        "message": (
            "Account created. We've emailed a 6-digit code to verify "
            "your school ID address."
        ),
        "email_sent": email_sent,
    }

    if email_error:
        response_data["email_error"] = email_error

    return Response(response_data, status=status.HTTP_201_CREATED)


# =========================================================
# VERIFY EMAIL (STEP 2: ACTIVATE + EMAIL TEMPORARY PASSWORD)
# =========================================================
# Confirms the code, marks the account verified, and emails the real temporary password.
@api_view(["POST"])
@permission_classes([AllowAny])
def verify_email(request):

    email = (request.data.get("email") or "").strip().lower()
    code = (request.data.get("code") or "").strip()

    # One generic error for every failure so the cause can't be probed.
    invalid_code_response = Response(
        {"error": "That code is invalid or has expired. Please request a new one."},
        status=status.HTTP_400_BAD_REQUEST,
    )

    if not email or not code:
        return invalid_code_response

    account = Account.objects.filter(email__iexact=email).first()

    if account is None or account.is_archived:
        return invalid_code_response

    if account.is_verified:
        return Response(
            {"message": "This account is already verified. You can log in."},
            status=status.HTTP_200_OK,
        )

    with transaction.atomic():
        # Lock the newest unused code so two requests can't use it at once.
        record = (
            EmailVerificationCode.objects.select_for_update()
            .filter(account=account, used=False)
            .order_by("-created_at")
            .first()
        )

        if record is None or record.expires_at <= timezone.now():
            return invalid_code_response

        if record.attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS:
            return invalid_code_response

        # Wrong code counts as one of the 5 allowed attempts.
        if not check_password(code, record.code_hash):
            record.attempts += 1
            record.save(update_fields=["attempts"])
            return invalid_code_response

        # Code is correct: activate the account and set the real temporary password.
        generated_password = get_random_string(12, allowed_chars=TEMP_PASSWORD_CHARS)

        account.set_password(generated_password)
        account.is_verified = True
        account.must_change_password = True
        account.has_temporary_password = True
        account.temp_password_issued_at = timezone.now()
        # Hidden from the Users list until the first login with the temporary password.
        account.is_pending_activation = True
        account.save()

        record.used = True
        record.save(update_fields=["used"])

        # Remove any other codes for this account.
        EmailVerificationCode.objects.filter(account=account).exclude(pk=record.pk).delete()

    full_name = f"{account.first_name} {account.last_name}".strip()

    subject = "Your SLC Seek & Balik Account Password"
    message = f"""
Hello {full_name},

Your email has been verified and your account is now active.

Email:
{account.email}

Temporary Password:
{generated_password}

Please login and change your password immediately.

Student Affairs Office
Saint Louis College
"""

    email_sent = True
    email_error = None

    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [account.email],
            fail_silently=False,
        )
    except Exception as e:
        email_sent = False
        email_error = str(e)
        logger.exception("Temp password email failed for %s", account.email)

    response_data = {
        "message": "Email verified! Your temporary password has been emailed to you.",
        "email_sent": email_sent,
    }
    if email_error:
        response_data["email_error"] = email_error

    return Response(response_data, status=status.HTTP_200_OK)


# =========================================================
# RESEND EMAIL VERIFICATION CODE
# =========================================================
# Always returns the same message so it can't reveal which emails are registered.
EMAIL_VERIFICATION_GENERIC_MESSAGE = (
    "If that account needs verification, a new code has been sent."
)


@api_view(["POST"])
@permission_classes([AllowAny])
def resend_verification_code(request):

    email = (request.data.get("email") or "").strip().lower()

    generic_response = Response(
        {"message": EMAIL_VERIFICATION_GENERIC_MESSAGE},
        status=status.HTTP_200_OK,
    )

    if not email:
        return generic_response

    account = Account.objects.filter(email__iexact=email).first()

    if account is None or account.is_archived or account.is_verified:
        return generic_response

    # 60-second throttle between codes.
    recently_sent = EmailVerificationCode.objects.filter(
        account=account,
        created_at__gte=timezone.now() - timedelta(seconds=EMAIL_VERIFICATION_RESEND_SECONDS),
    ).exists()

    if recently_sent:
        return generic_response

    _send_verification_code(account)

    return generic_response


# =========================================================
# LOGIN LOCKOUT
#   - 3 wrong passwords in a row -> login locked for 10 minutes.
#   - Still wrong on the 5th try -> locked again and the user is told to
#     reset their password (Forgot Password).
#   - Any wrong try after that also locks for 10 minutes.
#   - A successful login or a password reset clears the counter.
# =========================================================
LOGIN_LOCK_AFTER = 3
LOGIN_SUGGEST_RESET_AFTER = 5
LOGIN_LOCK_MINUTES = 10


def _lock_payload(account, message, suggest_reset=False):
    seconds_left = max(0, int((account.login_locked_until - timezone.now()).total_seconds()))
    return {
        "error": message,
        "locked": True,
        "locked_until": account.login_locked_until.isoformat(),
        "seconds_left": seconds_left,
        "failed_attempts": account.failed_login_attempts,
        "suggest_reset": suggest_reset,
    }


def _reset_login_lock(account):
    if account.failed_login_attempts or account.login_locked_until:
        account.failed_login_attempts = 0
        account.login_locked_until = None
        account.save(update_fields=["failed_login_attempts", "login_locked_until"])


# =========================================================
# LOGIN
# =========================================================
# Returns 404 "Invalid ID number" for an unknown ID and 401 "Invalid password" for a wrong password.
@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):

    serializer = AccountLoginSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    login_id = (serializer.validated_data["username"] or "").strip()
    password = serializer.validated_data["password"]

    # The login ID can be either the username or the email (any letter case).
    account = (
        Account.objects.filter(username__iexact=login_id).first()
        or Account.objects.filter(email__iexact=login_id).first()
    )

    # No account matches this email / ID: the user hasn't registered yet.
    # `not_registered` lets the login form offer a "Register" button.
    if account is None:
        return Response(
            {
                "error": "This account is not registered. Please register your account.",
                "not_registered": True,
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if account.is_archived:
        return Response(
            {"error": "This account has been archived."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # A previous admin who was replaced when the new admin logged in.
    if account.role == "admin" and not account.is_current_admin and not account.is_pending_admin:
        return Response(
            {"error": "This admin account has been replaced by a new administrator and is no longer active."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Manual active/inactive toggle.
    if not account.is_active:
        return Response(
            {"error": "This account is inactive."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Self-registered accounts must verify their email code before logging in.
    if not account.is_verified:
        return Response(
            {
                "error": "Please verify your email before logging in.",
                "unverified": True,
                "email": account.email,
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # Still locked from earlier wrong passwords: don't even check it.
    if account.login_locked_until and account.login_locked_until > timezone.now():
        suggest = account.failed_login_attempts >= LOGIN_SUGGEST_RESET_AFTER
        return Response(
            _lock_payload(
                account,
                "Too many failed login attempts. Please wait before trying again."
                + (" You may want to reset your password." if suggest else ""),
                suggest_reset=suggest,
            ),
            status=status.HTTP_423_LOCKED,
        )

    user = authenticate(
        request,
        username=account.username,
        password=password,
    )

    # The account exists but the password is wrong.
    if user is None:
        account.failed_login_attempts += 1
        attempts = account.failed_login_attempts

        if attempts >= LOGIN_SUGGEST_RESET_AFTER:
            account.login_locked_until = timezone.now() + timedelta(minutes=LOGIN_LOCK_MINUTES)
            account.save(update_fields=["failed_login_attempts", "login_locked_until"])
            return Response(
                _lock_payload(
                    account,
                    f"Incorrect password {attempts} times. Login is locked for {LOGIN_LOCK_MINUTES} minutes. "
                    "Forgot your password? Reset it to get back into your account.",
                    suggest_reset=True,
                ),
                status=status.HTTP_423_LOCKED,
            )

        if attempts == LOGIN_LOCK_AFTER:
            account.login_locked_until = timezone.now() + timedelta(minutes=LOGIN_LOCK_MINUTES)
            account.save(update_fields=["failed_login_attempts", "login_locked_until"])
            return Response(
                _lock_payload(
                    account,
                    f"Incorrect password {attempts} times. Login is locked for {LOGIN_LOCK_MINUTES} minutes.",
                ),
                status=status.HTTP_423_LOCKED,
            )

        account.save(update_fields=["failed_login_attempts"])
        if attempts < LOGIN_LOCK_AFTER:
            left = LOGIN_LOCK_AFTER - attempts
            message = (
                f"Invalid password. {left} attempt{'s' if left != 1 else ''} left before "
                f"login is locked for {LOGIN_LOCK_MINUTES} minutes."
            )
        else:
            left = LOGIN_SUGGEST_RESET_AFTER - attempts
            message = (
                f"Invalid password. {left} attempt{'s' if left != 1 else ''} left before "
                "you'll be asked to reset your password."
            )
        return Response(
            {"error": message, "failed_attempts": attempts, "attempts_left": left},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # Correct password: clear any earlier failed attempts.
    _reset_login_lock(user)

    # The emailed temporary password only works for TEMP_PASSWORD_VALID_DAYS.
    if (
        user.must_change_password
        and user.temp_password_issued_at
        and timezone.now() > user.temp_password_issued_at + timedelta(days=TEMP_PASSWORD_VALID_DAYS)
    ):
        return Response(
            {
                "error": (
                    f"Your temporary password expired after {TEMP_PASSWORD_VALID_DAYS} days. "
                    "Please use Forgot password to set a new password."
                ),
                "temp_password_expired": True,
                "suggest_reset": True,
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # First successful login completes activation, so the account now shows in the Users list.
    if user.is_pending_activation:
        user.is_pending_activation = False
        user.save(update_fields=["is_pending_activation"])

    # A pending admin takes over as current admin on first login.
    _activate_if_pending_admin(user)

    refresh = RefreshToken.for_user(user)

    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": AccountSerializer(user).data,
        },
        status=status.HTTP_200_OK,
    )


# =========================================================
# CHANGE PASSWORD
# =========================================================
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):

    user = request.user

    current_password = request.data.get("current_password", "")
    new_password = request.data.get("new_password", "")

    if not new_password:
        return Response(
            {"error": "New password is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_password) < 8 or len(new_password) > 12:
        return Response(
            {"error": "Password must be 8-12 characters long."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if any(c.isspace() for c in new_password):
        return Response(
            {"error": "Password must not contain spaces."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not any(c.isupper() for c in new_password):
        return Response(
            {"error": "Password must contain at least one capital letter."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not any(not (c.isascii() and c.isalnum()) for c in new_password):
        return Response(
            {"error": "Password must contain at least one special character (e.g. ! @ # $ %)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The current password is ALWAYS required, including the emailed
    # temporary one. Changing it is optional and can happen any time from
    # the profile, so this stops anyone who finds the account still logged
    # in on a shared computer from taking it over.
    #
    # It is checked BEFORE comparing the new password with the current
    # one. In the old order, someone without the current password could
    # type guesses as the "new" password and the reply "New password
    # cannot match current password" told them when a guess was right.
    if not current_password:
        return Response(
            {"error": "Current password required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.check_password(current_password):
        return Response(
            {"error": "Current password incorrect."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.check_password(new_password):
        return Response(
            {"error": "New password cannot match current password."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.must_change_password = False
    user.has_temporary_password = False
    user.temp_password_issued_at = None
    user.save()

    # Sign the account out everywhere else: saved logins (refresh tokens)
    # made with the old password stop working. The website already sends
    # the user back to the login form after a change.
    _revoke_sessions([user.pk])

    return Response(
        {"message": "Password changed successfully."},
        status=status.HTTP_200_OK,
    )


# =========================================================
# FORGOT PASSWORD (STEP 1: REQUEST A CODE)
# =========================================================
# Always returns the same message so it can't reveal which emails are registered.
PASSWORD_RESET_GENERIC_MESSAGE = (
    "If an account exists for that email, a 6-digit code has been sent."
)


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_request(request):

    email = (request.data.get("email") or "").strip().lower()

    if not email:
        return Response(
            {"email": ["Email is required."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    generic_response = Response(
        {"message": PASSWORD_RESET_GENERIC_MESSAGE},
        status=status.HTTP_200_OK,
    )

    account = Account.objects.filter(email__iexact=email).first()

    # Archived or inactive accounts get no code but still see the generic response.
    if account is None or account.is_archived or not account.is_active:
        return generic_response

    now = timezone.now()

    # 60-second server-side throttle between codes.
    recently_sent = PasswordResetCode.objects.filter(
        account=account,
        created_at__gte=now - timedelta(seconds=PASSWORD_RESET_RESEND_SECONDS),
    ).exists()

    if recently_sent:
        return generic_response

    code = get_random_string(PASSWORD_RESET_CODE_LENGTH, allowed_chars="0123456789")

    with transaction.atomic():
        # Only the newest code is ever valid.
        PasswordResetCode.objects.filter(account=account).delete()

        PasswordResetCode.objects.create(
            account=account,
            code_hash=make_password(code),
            created_at=now,
            expires_at=now + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES),
        )

    full_name = f"{account.first_name} {account.last_name}".strip() or "there"

    subject = "Your SLC Seek & Balik Password Reset Code"

    message = f"""
Hello {full_name},

We received a request to reset the password for your Seek & Balik account.

Your 6-digit code:
{code}

This code expires in {PASSWORD_RESET_TTL_MINUTES} minutes and can only be used once.

If you did not request this, you can ignore this email. Your password
will not change.

Student Affairs Office
Saint Louis College
"""

    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [account.email],
            fail_silently=False,
        )
    except Exception:
        # Logged only, so the response stays generic.
        logger.exception("Password reset email failed for %s", account.email)

    return generic_response


# =========================================================
# FORGOT PASSWORD (STEP 2: VERIFY CODE + SET NEW PASSWORD)
# =========================================================
@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_verify(request):
    """
    Step 2 of Forgot Password: checks the 6-digit code BEFORE the new
    password is asked for. The code is NOT used up here — the same code
    is checked again (and only then marked used) by
    password_reset_confirm, so this step can't be used to skip it.

    A wrong code counts as one of the PASSWORD_RESET_MAX_ATTEMPTS, the
    same as on the confirm step.
    """
    email = (request.data.get("email") or "").strip().lower()
    code = (request.data.get("code") or "").strip()

    invalid_code_response = Response(
        {"error": "That code is invalid or has expired. Please request a new one."},
        status=status.HTTP_400_BAD_REQUEST,
    )

    if not email or not code:
        return invalid_code_response

    account = Account.objects.filter(email__iexact=email).first()
    if account is None or account.is_archived or not account.is_active:
        return invalid_code_response

    with transaction.atomic():
        reset = (
            PasswordResetCode.objects.select_for_update()
            .filter(account=account, used=False)
            .order_by("-created_at")
            .first()
        )

        if reset is None or reset.expires_at <= timezone.now():
            return invalid_code_response

        if reset.attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
            return invalid_code_response

        if not check_password(code, reset.code_hash):
            reset.attempts += 1
            reset.save(update_fields=["attempts"])
            return invalid_code_response

    return Response({"valid": True}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_confirm(request):

    email = (request.data.get("email") or "").strip().lower()
    code = (request.data.get("code") or "").strip()
    new_password = request.data.get("new_password", "")

    invalid_code_response = Response(
        {"error": "That code is invalid or has expired. Please request a new one."},
        status=status.HTTP_400_BAD_REQUEST,
    )

    if not email or not code:
        return invalid_code_response

    # Password rules are checked before the code so a bad password doesn't use up an attempt.
    if not new_password:
        return Response(
            {"error": "New password is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_password) < 8 or len(new_password) > 12:
        return Response(
            {"error": "Password must be 8-12 characters long."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if any(c.isspace() for c in new_password):
        return Response(
            {"error": "Password must not contain spaces."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not any(c.isupper() for c in new_password):
        return Response(
            {"error": "Password must contain at least one capital letter."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not any(not (c.isascii() and c.isalnum()) for c in new_password):
        return Response(
            {"error": "Password must contain at least one special character (e.g. ! @ # $ %)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    account = Account.objects.filter(email__iexact=email).first()

    if account is None or account.is_archived or not account.is_active:
        return invalid_code_response

    with transaction.atomic():
        # Lock the newest unused code so two requests can't use it at once.
        reset = (
            PasswordResetCode.objects.select_for_update()
            .filter(account=account, used=False)
            .order_by("-created_at")
            .first()
        )

        if reset is None or reset.expires_at <= timezone.now():
            return invalid_code_response

        if reset.attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
            return invalid_code_response

        # Wrong code counts as one of the 5 allowed attempts.
        if not check_password(code, reset.code_hash):
            reset.attempts += 1
            reset.save(update_fields=["attempts"])
            return invalid_code_response

        if account.check_password(new_password):
            return Response(
                {"error": "New password cannot match current password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        account.set_password(new_password)
        # A reset also clears the temporary-password flags.
        account.must_change_password = False
        account.has_temporary_password = False
        account.temp_password_issued_at = None
        # A new password also unlocks the login (see LOGIN LOCKOUT).
        account.failed_login_attempts = 0
        account.login_locked_until = None
        account.save()

        reset.used = True
        reset.save(update_fields=["used"])

        # Remove any other codes for this account.
        PasswordResetCode.objects.filter(account=account).exclude(pk=reset.pk).delete()

    return Response(
        {"message": "Password changed successfully."},
        status=status.HTTP_200_OK,
    )


# =========================================================
# LOGOUT
# =========================================================
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):

    serializer = AccountLogoutSerializer(data=request.data)

    if serializer.is_valid():
        try:
            # Blacklist the refresh token so it can't be used again.
            token = RefreshToken(serializer.validated_data["refresh"])
            token.blacklist()

            return Response(
                {"message": "Logout successful"},
                status=status.HTTP_205_RESET_CONTENT,
            )

        except Exception:
            return Response(
                {"error": "Invalid refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# =========================================================
# REFRESH TOKEN
# =========================================================
@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_token(request):

    try:
        refresh = request.data.get("refresh")

        if not refresh:
            return Response(
                {"error": "Refresh token required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = RefreshToken(refresh)

        # Don't renew a session for an account that was deleted, disabled
        # or archived (e.g. an admin replaced by a new admin).
        account = Account.objects.filter(pk=token.get("user_id")).first()
        if account is None or not account.is_active or account.is_archived:
            return Response(
                {"error": "This session is no longer valid. Please log in again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(
            {"access": str(token.access_token)},
            status=status.HTTP_200_OK,
        )

    except Exception:
        return Response(
            {"error": "Invalid refresh token."},
            status=status.HTTP_400_BAD_REQUEST,
        )


# =========================================================
# SELF-UPDATE HELPER
# =========================================================
# Saves a user's changes to their OWN account. Only SELF_EDITABLE_FIELDS are
# kept, so role, is_active, email, password, etc. can never be changed this
# way. Shared by PATCH account/current/ and by PUT/PATCH account/users/<id>/
# when a Student/Employee sends their own id.
def _update_own_account(request):
    data = {
        key: value
        for key, value in request.data.items()
        if key in SELF_EDITABLE_FIELDS
    }

    serializer = AccountSerializer(
        request.user,
        data=data,
        partial=True,
    )

    if serializer.is_valid():
        account = serializer.save()
        return Response(AccountSerializer(account).data)

    return Response(
        serializer.errors,
        status=status.HTTP_400_BAD_REQUEST,
    )


# =========================================================
# CURRENT USER
# =========================================================
# GET returns the logged-in user's account; PATCH updates only SELF_EDITABLE_FIELDS on it.
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def current_user(request):

    if request.method == "GET":
        return Response(
            AccountSerializer(request.user).data,
            status=status.HTTP_200_OK,
        )

    # Drops every field a user must not change on their own account (role, is_active, etc.).
    return _update_own_account(request)


# =========================================================
# TERMS AND DATA PRIVACY CONSENT
# =========================================================
# Records that the logged-in user tapped "I Agree". The client sends the
# version of the terms it showed; it must be the current TERMS_VERSION, so
# an outdated app can't record consent to text the user never saw.
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_terms(request):

    version = str(request.data.get("version") or "").strip()

    if version != TERMS_VERSION:
        return Response(
            {
                "error": "These terms are out of date. Please update the app and try again.",
                "terms_version": TERMS_VERSION,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user

    # Agreeing again to the same version keeps the original date.
    if user.terms_version_accepted != TERMS_VERSION:
        user.terms_version_accepted = TERMS_VERSION
        user.terms_accepted_at = timezone.now()
        user.save(update_fields=["terms_version_accepted", "terms_accepted_at"])

    return Response(AccountSerializer(user).data, status=status.HTTP_200_OK)


# =========================================================
# USER-MANAGEMENT PERMISSIONS
# =========================================================
# Hiding the Users page in React is not enough: these checks make the
# backend itself refuse user management from anyone who is not staff.
# - Admin (the current one): full control.
# - Moderator: can view users and archive/restore Student/Employee accounts
#   (Archive page), but cannot change roles, passwords, or staff accounts.
# - Student/Employee: no access to other users. On their OWN id they may
#   read their account and change SELF_EDITABLE_FIELDS only (the same as
#   account/current/).
NON_STAFF_ROLES = ("student", "employee")
MODERATOR_EDITABLE_FIELDS = {
    "first_name", "last_name", "email", "contact_number",
    "is_active", "is_archived", "role",
}


def _is_admin(user):
    # A replaced admin's old login token must not keep admin powers.
    return bool(
        user and user.is_authenticated
        and user.role == "admin"
        and user.is_active
        and user.is_current_admin
    )


def _is_staff(user):
    return bool(
        user and user.is_authenticated
        and user.is_active
        and not user.is_archived
        and (_is_admin(user) or user.role == "moderator")
    )


def _forbidden(message):
    return Response({"error": message}, status=status.HTTP_403_FORBIDDEN)


# =========================================================
# USERS
# =========================================================
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def get_user(request):

    if not _is_staff(request.user):
        return _forbidden("Only Admin or Moderator staff can view users.")

    if request.method == "POST" and not _is_admin(request.user):
        return _forbidden("Only the Admin can add users.")

    if request.method == "GET":
        # Lists only users who verified their email and logged in once with the temporary password.
        users = (
            Account.objects
            .filter(is_verified=True, is_pending_activation=False)
            .order_by("-id")
        )
        serializer = AccountSerializer(users, many=True)
        return Response(serializer.data)

    # POST: staff create a user; pending-admin handling is inside the helper.
    data = request.data.copy()

    return _create_account_helper(data)


# =========================================================
# UPDATE / DELETE USER
# =========================================================
# PATCH is accepted as well as PUT; both are partial updates.
@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def update_user(request, pk):

    try:
        user = Account.objects.get(pk=pk)
    except Account.DoesNotExist:
        return Response(
            {"error": "User not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not _is_staff(request.user):
        # A Student/Employee may use this endpoint on their OWN account only:
        # read it, or change SELF_EDITABLE_FIELDS. Everything else they send
        # (role, is_active, email, password...) is ignored, and they can
        # never touch another user or delete an account.
        is_own_account = (
            user.pk == request.user.pk
            and request.user.is_active
            and not request.user.is_archived
        )

        if not is_own_account or request.method == "DELETE":
            return _forbidden("Only Admin or Moderator staff can manage users.")

        if request.method == "GET":
            return Response(AccountSerializer(user).data)

        return _update_own_account(request)

    if request.method == "GET":
        return Response(AccountSerializer(user).data)

    if request.method in ("PUT", "PATCH"):

        if not _is_admin(request.user):
            # Moderators may only touch Student/Employee accounts, and only
            # the fields the Archive page sends. They can never change a role.
            if user.role not in NON_STAFF_ROLES:
                return _forbidden("Only the Admin can edit Admin or Moderator accounts.")

            blocked = set(request.data.keys()) - MODERATOR_EDITABLE_FIELDS
            if blocked:
                return _forbidden(
                    "Moderators cannot change: " + ", ".join(sorted(blocked)) + "."
                )

            new_role = request.data.get("role")
            if new_role not in (None, "", user.role):
                return _forbidden("Only the Admin can change a user's role.")

            # The email is the login, and Forgot Password sends the reset
            # code there, so changing it would let a moderator take over
            # the account. The Archive page still sends the unchanged email.
            new_email = request.data.get("email")
            if new_email not in (None, "") and str(new_email).strip().lower() != (user.email or "").lower():
                return _forbidden("Only the Admin can change a user's email.")

        # Admin accounts are never archived (Account.save() forces
        # is_archived=False), so this used to reply "200 OK" while nothing
        # changed and the page said "User archived successfully!".
        wants_archive = str(request.data.get("is_archived", "")).lower() in ("true", "1")
        if wants_archive and (user.role == "admin" or request.data.get("role") == "admin"):
            return Response(
                {"error": "Admin accounts can't be archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # The current admin must stay an admin; otherwise the system could
        # be left with no admin. (For the original admin the change was
        # also silently undone by Account.save(), while the page reported
        # success.) A new admin takes over by being added and logging in.
        new_role = request.data.get("role")
        if (
            user.role == "admin"
            and user.is_current_admin
            and new_role not in (None, "", "admin")
        ):
            return Response(
                {"error": "The current admin's role can't be changed. Add the new admin first; they take over when they log in."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Read the role before saving, because save() changes this same instance.
        was_admin = user.role == "admin"

        data = request.data.copy()

        serializer = AccountSerializer(
            user,
            data=data,
            partial=True
        )

        if serializer.is_valid():
            account = serializer.save()

            # Only a promotion into admin starts the pending handover, not ordinary edits.
            # Re-activating a previously replaced admin counts as a new admin too.
            reactivating_old_admin = (
                was_admin
                and account.role == "admin"
                and not account.is_current_admin
                and not account.is_pending_admin
                and str(request.data.get("is_active", "")).lower() in ("true", "1")
            )
            if account.role == "admin" and (not was_admin or reactivating_old_admin):
                _mark_admin_pending(account)

            # A pending admin moved out of the admin role is no longer waiting.
            if account.role != "admin" and account.is_pending_admin:
                account.is_pending_admin = False
                account.save(update_fields=["is_pending_admin"])

            return Response(AccountSerializer(account).data)

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == "DELETE":

        if not _is_admin(request.user):
            return _forbidden("Only the Admin can delete users.")

        # The admin account can never be deleted.
        if user.role == "admin":
            return Response(
                {"error": "The system administrator cannot be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user.delete()

        return Response(
            {"message": "User deleted successfully."},
            status=status.HTTP_200_OK,
        )