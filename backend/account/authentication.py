"""
FORCED TEMPORARY-PASSWORD CHANGE (enforced by the backend)

An account still on the temporary password that was emailed to it
(must_change_password=True) can only:
  - read its own profile        GET  account/current/
  - change its password         POST account/change-password/
  - log out                     POST account/logout/
  - agree to the terms          POST account/terms/accept/
Every other request made with its login token is refused with 403
{"password_change_required": true}. So refreshing the page or calling the
API directly can never skip the change-password step.

Used as the default authentication class in backend/settings.py.
"""
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


class PasswordChangeRequired(exceptions.PermissionDenied):
    default_detail = "You must change your temporary password before continuing."
    default_code = "password_change_required"

    def __init__(self):
        super().__init__({
            "detail": self.default_detail,
            "password_change_required": True,
        })


ALLOWED_WHILE_TEMPORARY = (
    ("account/current", ("GET",)),
    ("account/change-password", ("POST",)),
    ("account/logout", ("POST",)),
    ("account/terms/accept", ("POST",)),
)


class TemporaryPasswordJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result

        # An archived account loses access straight away. Without this, a
        # login token issued before it was archived kept working until it
        # expired (up to an hour): the user could still edit their profile,
        # browse and submit requests. (Inactive accounts are already refused
        # by JWTAuthentication itself.)
        if getattr(user, "is_archived", False):
            raise exceptions.AuthenticationFailed(
                "This account has been archived. Please contact the Student Affairs Office.",
                code="user_archived",
            )

        if getattr(user, "must_change_password", False):
            path = request.path.strip("/")
            method = request.method.upper()
            allowed = any(
                path.endswith(suffix) and method in methods
                for suffix, methods in ALLOWED_WHILE_TEMPORARY
            )
            if not allowed:
                raise PasswordChangeRequired()

        return user, token
