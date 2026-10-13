"""
Brevo email backend for Django.

Sends every email that Django sends (send_mail, EmailMessage,
EmailMultiAlternatives, password reset emails, ...) through Brevo's HTTPS
API instead of SMTP. This matters on hosts that block SMTP ports, such as
PythonAnywhere's free plan (only ports 80/443 are open, and api.brevo.com
is on its allowlist).

Enabled in settings.py:
    EMAIL_BACKEND = 'backend.brevo_backend.BrevoEmailBackend'

Uses these settings (read from .env in settings.py):
    BREVO_API_KEY       - Brevo > SMTP & API > API Keys
    BREVO_SENDER_EMAIL  - must be a verified sender in Brevo
    BREVO_SENDER_NAME   - name shown as the sender

No extra packages are needed (uses Python's built-in urllib).
"""

import base64
import json
import logging
import urllib.error
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
REQUEST_TIMEOUT_SECONDS = 20


def _recipients(addresses):
    """['Name <a@b.com>', 'c@d.com'] -> [{'email': 'a@b.com', 'name': 'Name'}, ...]"""
    result = []
    for raw in addresses or []:
        name, email = parseaddr(str(raw))
        if not email:
            continue
        entry = {"email": email}
        if name:
            entry["name"] = name
        result.append(entry)
    return result


class BrevoEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        api_key = getattr(settings, "BREVO_API_KEY", "") or ""
        if not api_key:
            if self.fail_silently:
                return 0
            raise ImproperlyConfigured(
                "BREVO_API_KEY is not set, so emails cannot be sent. Add it to the .env file."
            )

        sent = 0
        for message in email_messages:
            try:
                if self._send(message, api_key):
                    sent += 1
            except Exception:
                logger.exception("Brevo could not send the email '%s'.", message.subject)
                if not self.fail_silently:
                    raise
        return sent

    def _build_payload(self, message):
        # The sender must be a verified sender in Brevo, so the configured
        # address is always used. The name falls back to the message's own.
        from_name, from_email = parseaddr(
            message.from_email or getattr(settings, "DEFAULT_FROM_EMAIL", "")
        )
        sender_email = getattr(settings, "BREVO_SENDER_EMAIL", "") or from_email
        sender_name = getattr(settings, "BREVO_SENDER_NAME", "") or from_name

        sender = {"email": sender_email}
        if sender_name:
            sender["name"] = sender_name

        to = _recipients(message.to)
        cc = _recipients(message.cc)
        bcc = _recipients(message.bcc)

        # Brevo needs at least one "to" address.
        if not to:
            if bcc:
                to, bcc = bcc[:1], bcc[1:]
            elif cc:
                to, cc = cc[:1], cc[1:]
            else:
                return None

        payload = {
            "sender": sender,
            "to": to,
            "subject": message.subject or "(no subject)",
        }
        if cc:
            payload["cc"] = cc
        if bcc:
            payload["bcc"] = bcc

        reply_to = _recipients(getattr(message, "reply_to", None))
        if reply_to:
            payload["replyTo"] = reply_to[0]

        # Body: plain text, plus HTML when the message has an HTML version
        # (EmailMultiAlternatives, html_message= in send_mail, or an
        # EmailMessage whose content_subtype is "html").
        html_body = None
        for content, mimetype in getattr(message, "alternatives", None) or []:
            if mimetype == "text/html":
                html_body = content
                break

        if getattr(message, "content_subtype", "plain") == "html":
            html_body = html_body or message.body
        elif message.body:
            payload["textContent"] = message.body

        if html_body:
            payload["htmlContent"] = html_body
        if "textContent" not in payload and "htmlContent" not in payload:
            payload["textContent"] = " "

        # Attachments added with attach(filename, content, mimetype).
        attachments = []
        for attachment in message.attachments or []:
            if isinstance(attachment, tuple) and len(attachment) >= 2:
                filename, content = attachment[0], attachment[1]
                if isinstance(content, str):
                    content = content.encode("utf-8")
                attachments.append({
                    "name": filename or "attachment",
                    "content": base64.b64encode(content).decode("ascii"),
                })
            else:
                logger.warning("Skipped an attachment Brevo cannot send: %r", attachment)
        if attachments:
            payload["attachment"] = attachments

        return payload

    def _send(self, message, api_key):
        payload = self._build_payload(message)
        if payload is None:
            return False

        request = urllib.request.Request(
            BREVO_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                return 200 <= response.status < 300
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            raise RuntimeError(f"Brevo rejected the email ({error.code}): {detail}") from error