"""
FORCE-FIX management command: reactivates the admin account AND resets its
password to a known value, so we eliminate BOTH possible causes of login
failure at once (inactive/archived account, and/or a wrong or corrupted
password).

FILE LOCATION (create this exact path/folder structure):
    backend/account/management/__init__.py            (empty file)
    backend/account/management/commands/__init__.py   (empty file)
    backend/account/management/commands/force_fix_admin.py   (this file)

USAGE (from the backend folder, with your venv active):
    python manage.py force_fix_admin

This replaces the old approach of pasting this logic into admin.py or
exec()-ing a loose script in the shell. As a management command, this code
ONLY runs when you explicitly type the command above — never on server
startup, never on makemigrations, never on import.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

TARGET_EMAIL = "admin@slc-sflu.edu.ph"
NEW_PASSWORD = "Admin123456!"


class Command(BaseCommand):
    help = "Reactivates the admin account and resets its password to a known value."

    def handle(self, *args, **options):
        User = get_user_model()

        user = None
        last_error = None

        for field in ("email", "username"):
            try:
                user = User.objects.get(**{field: TARGET_EMAIL})
                self.stdout.write(f"Found user via '{field}' lookup (id={user.id}).")
                break
            except User.DoesNotExist as e:
                last_error = e
                continue
            except User.MultipleObjectsReturned:
                # Duplicate rows with the same email would also explain a
                # broken login (Django might be matching a different,
                # still-inactive row).
                dupes = list(User.objects.filter(**{field: TARGET_EMAIL}))
                self.stdout.write(
                    self.style.WARNING(
                        f"WARNING: found {len(dupes)} accounts with this {field}!"
                    )
                )
                for d in dupes:
                    self.stdout.write(
                        f"  id={d.id}, is_active={d.is_active}, "
                        f"is_archived={getattr(d, 'is_archived', 'n/a')}, "
                        f"role={getattr(d, 'role', 'n/a')}"
                    )
                self.stdout.write("Manual review needed — stopping without changes.")
                user = None
                break

        if user is None:
            self.stdout.write(
                self.style.ERROR(
                    f"ERROR: Could not uniquely find a user with email/username "
                    f"'{TARGET_EMAIL}'."
                )
            )
            self.stdout.write(f"Last error: {last_error}")
            return

        self.stdout.write(
            f"BEFORE -> is_active: {user.is_active}, "
            f"is_archived: {getattr(user, 'is_archived', 'n/a')}, "
            f"role: {getattr(user, 'role', 'n/a')}, "
            f"is_staff: {getattr(user, 'is_staff', 'n/a')}"
        )

        user.is_active = True
        if hasattr(user, "is_archived"):
            user.is_archived = False
        if hasattr(user, "must_change_password"):
            user.must_change_password = False

        # This properly hashes the password the same way Django's own login
        # flow expects — never assign to user.password directly.
        user.set_password(NEW_PASSWORD)

        user.save()
        user.refresh_from_db()

        self.stdout.write(
            f"AFTER  -> is_active: {user.is_active}, "
            f"is_archived: {getattr(user, 'is_archived', 'n/a')}, "
            f"role: {getattr(user, 'role', 'n/a')}"
        )
        self.stdout.write(self.style.SUCCESS(f"Password has been reset to: {NEW_PASSWORD}"))
        self.stdout.write("Try logging in now with this email and password.")