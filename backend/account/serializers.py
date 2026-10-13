import re

from rest_framework import serializers
from .models import Account

# Contact numbers are exactly 11 digits (e.g. 09123456789). Older +63
# formats are converted; anything else is rejected.
CONTACT_NUMBER_LENGTH = 11

# Every account email must be a Saint Louis College school email.
SCHOOL_EMAIL_DOMAIN = "@slc-sflu.edu.ph"


def clean_contact_number(value):
    """Returns the 11-digit number, '' for blank, or raises ValidationError."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    digits = re.sub(r"[\s\-()]", "", raw)
    if digits.startswith("+"):
        digits = digits[1:]
    if not digits.isdigit():
        raise serializers.ValidationError("Contact number must contain digits only.")
    if len(digits) == 12 and digits.startswith("63"):
        digits = "0" + digits[2:]
    if len(digits) != CONTACT_NUMBER_LENGTH:
        raise serializers.ValidationError(
            "Contact number must be exactly 11 digits (e.g. 09123456789)."
        )
    return digits

class AccountSerializer(serializers.ModelSerializer):
    temp_password_expires_at = serializers.SerializerMethodField()
    # True when this account agreed to the CURRENT version of the terms.
    # The app and the website read this to decide whether to show the
    # Terms and Data Privacy Consent screen.
    terms_accepted = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'contact_number',  # Added to match frontend and model
            'role',
            'password',
            'is_active',
            'is_current_admin',  # NEW — single-current-admin flag, separate from is_active
            'is_pending_admin',  # new admin waiting for its first login (read-only)
            'is_archived',
            'must_change_password',
            'is_pending_activation',  # NEW — verified but hasn't logged in with temp password yet
            'temp_password_expires_at',  # when the emailed temporary password stops working
            'terms_accepted',          # agreed to the current terms version?
            'terms_version_accepted',  # the version they agreed to ('' = never)
            'terms_accepted_at',       # when they agreed
            'created_at',      # Added to fields list so they are returned in JSON
            'updated_at',
        ]
        extra_kwargs = {
            'password': {
                'write_only': True,
                'required': False,
                'allow_blank': True
            },
            'username': {
                'required': False,
                'allow_blank': True
            },
            # ------------------------------------------------------------
            # NAME REQUIRED — PERMANENT FIX
            #
            # Every unwanted "ghost" account found on Users.jsx (e.g.
            # #U-033, #U-032) had a blank first_name/last_name and only an
            # auto-derived <id_number>@slc-sflu.edu.ph email. No legitimate
            # account creation path (staff Add User, public self-register)
            # should ever produce that shape — a real registration always
            # has a name attached.
            #
            # Enforcing this HERE, at the serializer level, closes the gap
            # no matter which view/endpoint/caller ends up constructing an
            # AccountSerializer with incomplete data — it can no longer
            # create an Account without a name, full stop.
            # ------------------------------------------------------------
            'first_name': {
                'required': True,
                'allow_blank': False,
            },
            'last_name': {
                'required': True,
                'allow_blank': False,
            },
        }
        # is_pending_activation is server-controlled only (set in
        # verify_email(), cleared in login()); clients must never be
        # able to write it via create/PUT/PATCH.
        # The terms fields are also server-controlled: they change only
        # through registration consent or accept_terms() in views.py.
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'is_pending_activation', 'is_pending_admin',
            'terms_version_accepted', 'terms_accepted_at',
            # Which admin is "the" current one is decided only by the
            # single-admin handover in views.py. Writable, it let a PATCH
            # mark a second admin as current (two current admins at once).
            'is_current_admin',
        ]

    def get_temp_password_expires_at(self, obj):
        if not obj.must_change_password or not obj.temp_password_issued_at:
            return None
        from datetime import timedelta
        from .views import TEMP_PASSWORD_VALID_DAYS
        return (obj.temp_password_issued_at + timedelta(days=TEMP_PASSWORD_VALID_DAYS)).isoformat()

    def get_terms_accepted(self, obj):
        from .views import TERMS_VERSION
        return obj.terms_version_accepted == TERMS_VERSION

    def validate_contact_number(self, value):
        return clean_contact_number(value)

    def validate_email(self, value):
        # Account.save() stores emails in lowercase, but the built-in
        # "unique" check compares the text exactly. So "23100806@..." vs
        # "23100806@...".upper() passed the check and then crashed the save
        # with a database error (HTTP 500). Compare case-insensitively here
        # and return a normal "already exists" message instead.
        email = str(value or "").strip().lower()

        # Only Saint Louis College school emails can have an account
        # (e.g. 23100806@slc-sflu.edu.ph or admin@slc-sflu.edu.ph). This
        # covers staff-added users, edits by the Admin, and self-registration.
        if not email.endswith(SCHOOL_EMAIL_DOMAIN) or email == SCHOOL_EMAIL_DOMAIN:
            raise serializers.ValidationError(
                f"Only school emails ending in {SCHOOL_EMAIL_DOMAIN} are allowed."
            )

        existing = Account.objects.filter(email__iexact=email)
        if self.instance is not None:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def create(self, validated_data):
        password = validated_data.pop('password', None)

        # Fallback username to email if not provided
        if not validated_data.get('username'):
            validated_data['username'] = validated_data.get('email')

        user = Account(**validated_data)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)

        # Sync username if the email is updated by an admin
        email = validated_data.get('email', instance.email)
        if 'username' not in validated_data and email != instance.email:
            validated_data['username'] = email

        instance = super().update(instance, validated_data)

        if password:
            instance.set_password(password)
            instance.save()

        return instance


class AccountLoginSerializer(serializers.Serializer):
    # Note: Even though the frontend form says "Email Address", 
    # the React API sends it as 'username', which Django matches here.
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)


class AccountLogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()