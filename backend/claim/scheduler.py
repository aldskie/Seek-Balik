"""
Background scheduler for claim reminder emails (see reminders.py).

Started from ClaimConfig.ready() in apps.py. Wakes up at the start of
every minute (9:00:00, 9:01:00, ...) so a 9:00 AM meeting's reminder
goes out right at 9:00 AM.
"""
import logging
import os
import sys
import threading
import time

logger = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()

# Management commands that must NOT start the scheduler.
_SKIP_COMMANDS = {
    "makemigrations", "migrate", "shell", "test", "collectstatic",
    "createsuperuser", "check", "send_claim_reminders", "showmigrations",
    "dbshell", "flush", "loaddata", "dumpdata",
}


def should_start():
    flag = os.environ.get("CLAIM_REMINDER_SCHEDULER", "").strip().lower()
    if flag in ("0", "false", "off", "no"):
        return False
    if flag in ("1", "true", "on", "yes"):
        return True  # e.g. under gunicorn / waitress

    argv = sys.argv[1:]
    if any(cmd in argv for cmd in _SKIP_COMMANDS):
        return False
    if "runserver" in argv:
        # With the auto-reloader, only the child process (RUN_MAIN=true)
        # serves requests; start there so it runs once, not twice.
        return os.environ.get("RUN_MAIN") == "true" or "--noreload" in argv
    return False


def _loop():
    from django.db import close_old_connections
    from .reminders import send_due_reminders

    time.sleep(3)  # let the server finish starting
    while True:
        try:
            close_old_connections()
            send_due_reminders()
        except Exception:
            logger.exception("Claim reminder check failed")
        finally:
            close_old_connections()

        # Sleep until just after the next whole minute.
        now = time.time()
        time.sleep(60 - (now % 60) + 0.5)


def start():
    global _started
    with _lock:
        if _started or not should_start():
            return
        _started = True
    threading.Thread(target=_loop, name="claim-reminder-scheduler", daemon=True).start()
    logger.info("Claim reminder scheduler started")
