from django.db import models
from items.models import ItemDetails


class AvailableSchedule(models.Model):
    date = models.DateField()
    time_slot = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("date", "time_slot")
        ordering = ["date", "time_slot"]

    def __str__(self):
        return f"{self.date} @ {self.time_slot}"


class BlockedSlot(models.Model):
    """
    A date (or one time slot on a date) that staff disabled for claim
    meetings because of an urgent matter or event — managed from
    ClaimRequests.jsx's "Manage Slots" calendar.

    time_slot == "" means the WHOLE DAY is disabled. Otherwise it is one
    of ALLOWED_MEETING_TIME_SLOTS (claim/serializers.py). slot_error_for()
    rejects any claim / reclaim / staff schedule landing on a blocked
    slot, and ClaimModal.jsx hides those slots from claimants.
    """

    date = models.DateField()
    time_slot = models.CharField(max_length=50, blank=True, default="")
    reason = models.CharField(max_length=200, blank=True, default="")
    created_by = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("date", "time_slot")
        ordering = ["date", "time_slot"]

    @property
    def is_whole_day(self):
        return not self.time_slot

    def __str__(self):
        return f"{self.date} @ {self.time_slot or 'Whole day'} (blocked)"


class Claim(models.Model):
    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Scheduled", "Scheduled"),
        ("Approved", "Approved"),
        # What the staff Decline / Not the Owner buttons set (decline_claim
        # in views.py). It was missing here, so the Django admin showed
        # these claims with an invalid status.
        ("Rejected", "Rejected"),
        ("Declined", "Declined"),
        # The meeting day passed and the claimant didn't show up
        # (see claim/noshow.py).
        ("Timed Out", "Timed Out"),
        # The item was released to another claimant (see
        # claim/closing.py).
        ("Closed", "Closed"),
        # The item was handed to THIS claimant (item marked Claimed). Set even
        # if their claim had already timed out because they came late, so
        # they never see "missed meeting"/Re-claim for an item they have.
        ("Released", "Released"),
    ]

    item = models.ForeignKey(
        ItemDetails,
        on_delete=models.CASCADE,
        related_name="claims",
    )

    claimant_name = models.CharField(max_length=100)
    claimant_contact = models.CharField(max_length=30)
    claimant_email = models.EmailField()

    proof_description = models.TextField(max_length=500)

    claim_date = models.DateTimeField(auto_now_add=True)

    meeting_date = models.DateField(null=True, blank=True)
    meeting_time = models.CharField(max_length=50, null=True, blank=True)

    # FIX: previously had a `default="Student Affairs Office"` but no
    # `blank=True`. A model/serializer `default` only applies when a
    # field is entirely ABSENT from the input — it does NOT apply when
    # the field is explicitly submitted as "". Without blank=True, DRF
    # rejects an explicit "" at validation time with "This field may
    # not be blank," before the default ever gets a chance to kick in.
    #
    # ClaimModal.jsx submits meeting_location: "" for every claim
    # (staff fill in the real location later when they confirm the
    # meeting via ClaimRequests.jsx), so every single claim submission
    # was 400ing here — this is what caused "Claim submission failed"
    # with server response {"meeting_location": ["This field may not
    # be blank."]}. blank=True makes the backend accept the empty
    # string; the default value then still applies through normal
    # model-level save() behavior for anything that omits the field
    # outright (e.g. a future non-frontend caller of the API).
    meeting_location = models.CharField(
        max_length=100,
        default="Student Affairs Office",
        blank=True,
    )

    # "Rejected" is what the staff Decline button sets (see
    # decline_claim in views.py). ClaimRequests.jsx's isDeclined()
    # checks for it and drops the claim from both tables.
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Pending"
    )

    # --------------------------------------------------------------
    # OWNERSHIP Q&A
    #
    # ClaimModal.jsx has always submitted question_1..4 / answer_1..4
    # (the ownership verification questions and the claimant's typed/
    # selected answers) plus other_description and needs_manual_review,
    # but nothing on this model captured them — a plain ModelSerializer
    # silently drops any submitted key that isn't a declared field, so
    # every claim was losing this data on save. ClaimRequests.jsx's
    # "Automated Answer Check" panel and the Needs Attention / Scheduled
    # split both depend on these actually being persisted.
    # --------------------------------------------------------------

    question_1 = models.CharField(max_length=255, blank=True, default="")
    answer_1 = models.CharField(max_length=255, blank=True, default="")

    question_2 = models.CharField(max_length=255, blank=True, default="")
    answer_2 = models.CharField(max_length=255, blank=True, default="")

    question_3 = models.CharField(max_length=255, blank=True, default="")
    answer_3 = models.CharField(max_length=255, blank=True, default="")

    question_4 = models.CharField(max_length=255, blank=True, default="")
    answer_4 = models.CharField(max_length=255, blank=True, default="")

    # Optional free-text extra context from the claimant (ClaimModal.jsx's
    # "Other Unique Description" field). Never required, never gates
    # anything.
    other_description = models.TextField(max_length=300, blank=True, default="")

    # Set by ClaimModal.jsx when the live verify-answers check came back
    # mismatched (or couldn't be resolved) at submission time, so staff
    # can distinguish "no schedule because generic/unauto-checkable
    # questions" from "no schedule because an answer was actually wrong".
    #
    # schedule_meeting (views.py) now clears this to False once staff
    # confirm a meeting, since manual review is finished at that point.
    needs_manual_review = models.BooleanField(default=False)

    # --------------------------------------------------------------
    # STAFF-CONFIRMED SCHEDULE FLAG
    #
    # True only when a moderator/admin explicitly confirms a meeting
    # through ClaimRequests.jsx's Review -> Continue to Schedule ->
    # Confirm Schedule flow (send() there calls scheduleMeeting() with
    # staff_scheduled: true). A claimant can also end up with
    # meeting_date/meeting_time set on their own, by self-picking a slot
    # in ClaimModal.jsx when their verification answers matched — that
    # path never sets this flag, so it stays False.
    #
    # Dashboard.jsx's ClaimScheduleCalendar (isStaffConfirmedSchedule)
    # only counts claims where this is True, so it must be persisted
    # here and included in ClaimSerializer's fields.
    # --------------------------------------------------------------
    staff_scheduled = models.BooleanField(default=False)

    # --------------------------------------------------------------
    # STAFF APPROVED DESPITE MISMATCH
    #
    # True when a claim's answers were flagged as a mismatch against the
    # item's recorded answers, and staff clicked "Approve" in
    # ClaimRequests.jsx's Review modal and then confirmed a meeting
    # anyway. ClaimRequests.jsx sends this from send() only when the
    # approval happened; schedule_meeting in views.py persists it.
    #
    # Keeps a permanent record that a flagged claim was approved by
    # staff (instead of the mismatch silently disappearing once a
    # meeting exists).
    # --------------------------------------------------------------
    staff_approved_despite_mismatch = models.BooleanField(default=False)

    # When the "your meeting is now" reminder email was sent (see
    # claim/reminders.py). Null = not sent yet. schedule_meeting in
    # views.py clears it so a rescheduled meeting gets a new reminder.
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    # Set by decline_claim (views.py). not_owner = staff used the
    # "Not the Owner" button; ClaimRequests.jsx lists it in the Declined
    # tab with a "Not the Owner" remark.
    not_owner = models.BooleanField(default=False)
    declined_at = models.DateTimeField(null=True, blank=True)

    # Set on a re-claim: the timed-out claim this one was created from.
    # The ownership answers are copied from it, never re-entered.
    reclaim_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reclaims",
    )

    def __str__(self):
        return f"{self.claimant_name} - {self.item.title}"