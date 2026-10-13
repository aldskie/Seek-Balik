# ============================================================================
# items/models.py  (the "items" app - ItemDetails / ItemImage)
#
# CHANGES IN THIS FILE
#
# 1. The finder's ID field is now named `student_id` (previously
#    `id_number`). It is still a plain CharField holding just the finder's
#    8-digit Student ID (e.g. "12345678") - NOT a ForeignKey - so an
#    unregistered finder's item saves fine and can still earn points.
#
#    MIGRATION: run `python manage.py makemigrations items` and answer "y"
#    when Django asks whether itemdetails.id_number was renamed to
#    itemdetails.student_id. That generates a RenameField migration that
#    KEEPS existing data. Then run `python manage.py migrate`.
#
# 2. `claimed_by_name` / `claimed_by_contact` / `claimed_by_email` fields,
#    sent by FoundItems.jsx's handleClaimItem() on "Mark as Claimed".
#
# 3. `released_by` - the moderator/staff member who marked the item as
#    Claimed. Shown as "Released By" in the Found Item Review modal.
# ============================================================================

from django.core.validators import RegexValidator
from django.db import models
from django.conf import settings  # noqa: F401  (kept in case other code imports it from here)
import uuid

MAX_IMAGES_PER_ITEM = 3  # used by views.py - kept here as the single source of truth

# Exactly 8 digits, nothing else. Applied to ItemDetails.student_id.
student_id_validator = RegexValidator(
    regex=r'^\d{8}$',
    message='Student ID must be exactly 8 digits.',
)


class ItemDetails(models.Model):

    # (stored value, official building name). The stored value is the
    # exact text the frontend Area dropdowns save (LostItems.jsx,
    # FoundItems.jsx, ModeratorLostItems.jsx, ReportLostModal.jsx, and the
    # mobile AddItems / ReportLostItemScreen) and that Reports.jsx /
    # Dashboard.jsx / the campus maps match on; the label is the official
    # name. `location` itself has no `choices` because a report can list
    # several areas ("Library, Chapel") and "Others" allows custom text, so
    # changing this list needs no migration.
    #
    # There is one entry per building on the campus map. "Criminology
    # Building" is not listed: it is the same building as the Verbist
    # Building.
    LOCATIONS = [
        ("All", "All"),
        ("Grandstand", "Grandstand"),
        ("Verbist Building", "(V) Verbist Building"),
        ("Chapel", "Transfiguration of the Lord Chapel"),
        ("Administrative Building (Main Building)", "Fr. Alfred Spincemaille, CICM (Administrative Building)"),
        ("Library", "Gerard De Boeck Mission Library"),
        ("Gymnasium", "Fr. Burgos Gymnasium"),
        ("ICT Center", "(B) ICT Center"),
        ("New Building (CEA Building)", "(C) New Building"),
        ("New Elementary Building", "New Elementary Building"),
        ("SLC Canteen", "SLC Canteen"),
        ("Old Elementary Building", "(E) Bishop Wenceslao Padilla, CICM (Old Elementary Building)"),
        ("Conrado Dela Cruz Sports Center (CDC)", "Conrado Dela Cruz Sports Center"),
        ("Senior High School Department Building", "Fr. Roger Bruno Eduard Tjolle, CICM (Senior High School Department Building)"),
        ("HM Laboratory Building", "Rev. Fr. Clement Daelman, CICM (HM Laboratory Building)"),
        ("Student Affairs Office Lobby", "Student Affairs Office Lobby"),
        # On the campus map but were missing from this list.
        ("Parking Area", "Parking Area"),
        ("Junior High School", "Junior High School"),
        ("High School Library & ICT", "High School Library & ICT"),
        ("Others", "Others"),
    ]

    CATEGORIES = [
        ("All", "All"),
        ("Accessories", "Accessories"),
        ("ID", "ID"),
        ("Academic Materials", "Academic Materials"),
        ("Bags & Wallets", "Bags & Wallets"),
        ("Clothing", "Clothing"),
        ("Electronic", "Electronic"),
        ("Keys", "Keys"),
    ]

    ITEM_TYPE = [
        ("Lost", "Lost"),
        ("Surrendered", "Surrendered"),
    ]

    STATUS_OPTION = [
        ("Pending", "Pending"),
        ("Approved", "Approved"),
        ("Claimed", "Claimed"),
        ("Archived", "Archived"),
        ('Declined', 'Declined'),
    ]

    title = models.CharField(max_length=30)
    description = models.TextField(max_length=100, default='')

    # Reason staff gave when declining a report (status == 'Declined').
    # Kept even if the status later changes, so the history isn't lost -
    # the frontend only re-sends an empty string here when a report is
    # actively moved OUT of 'Declined'.
    declined_remarks = models.TextField(blank=True, default='')

    # ------------------------------------------------------------------
    # OWNERSHIP VERIFICATION QUESTIONS + ANSWERS (max 4 pairs)
    #
    # Written by admin/moderator when logging the found item. The
    # QUESTION text is shown to the claimant in the public Claim Modal.
    # The ANSWER itself is never sent to public (non-staff) API responses -
    # see ItemSerializers.to_representation - it is only used server-side
    # to grade the claimant's selection via the verify-answers endpoint.
    # ------------------------------------------------------------------
    verification_question_1 = models.CharField(max_length=150, blank=True, default='')
    verification_answer_1 = models.CharField(max_length=150, blank=True, default='')
    verification_question_2 = models.CharField(max_length=150, blank=True, default='')
    verification_answer_2 = models.CharField(max_length=150, blank=True, default='')
    verification_question_3 = models.CharField(max_length=150, blank=True, default='')
    verification_answer_3 = models.CharField(max_length=150, blank=True, default='')
    verification_question_4 = models.CharField(max_length=150, blank=True, default='')
    verification_answer_4 = models.CharField(max_length=150, blank=True, default='')

    # Full predefined answer-choice list for each verification question,
    # stored as a JSON-encoded string (e.g. '["Nike","Adidas","Penshoppe"]').
    # Empty string means this question has no predefined choices (free text).
    verification_options_1 = models.TextField(blank=True, default='')
    verification_options_2 = models.TextField(blank=True, default='')
    verification_options_3 = models.TextField(blank=True, default='')
    verification_options_4 = models.TextField(blank=True, default='')

    category = models.CharField(choices=CATEGORIES, default="All", max_length=30)
    location = models.CharField(default="All", max_length=254)
    # ------------------------------------------------------------------
    # WHEN THE ITEM WAS LOST / FOUND (a date + time range)
    #
    # start_date / start_time  (previously created_date / created_time)
    # end_date / end_time      optional end of the range; blank means the
    #                          item was lost/found at a single moment.
    # ------------------------------------------------------------------
    start_date = models.DateField()
    # Optional: the Report Lost form's "Approx. Time" can be left blank.
    # It used to be required here, so a student who skipped it only got
    # "Failed to submit report."
    start_time = models.TimeField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    image = models.ImageField(upload_to='items_photos/', null=True, blank=True)
    status = models.CharField(choices=STATUS_OPTION, max_length=30, default="Pending")
    # The status the item had right before it was archived, so restoring
    # from the Archive page puts it back exactly as it was (a Pending report
    # stays Pending until a moderator approves it; a Claimed item stays
    # Claimed). Blank for items that were never archived.
    status_before_archive = models.CharField(max_length=30, blank=True, default="")
    type = models.CharField(choices=ITEM_TYPE, max_length=30, default="Lost")
    poster_name = models.CharField(max_length=100, default='')

    # ------------------------------------------------------------------
    # FINDER / REPORTER STUDENT ID  (plain text, NOT a ForeignKey)
    #
    # The bare 8-digit Student ID (e.g. "12345678"). It is NOT linked to
    # an Account, so a finder who has no registered account can still be
    # recorded here and still earn points - the points system keys on
    # this same 8-digit value.
    #
    # blank=True / default='' only so legacy rows don't break; the
    # serializer requires it when a Surrendered item is CREATED.
    #
    # To match to a registered account, compare against the local part of
    # the account email: account.email.split('@')[0].
    # ------------------------------------------------------------------
    student_id = models.CharField(
        max_length=8,
        blank=True,
        default='',
        db_index=True,
        validators=[student_id_validator],
    )

    email = models.EmailField(max_length=254, default='')

    time_stamp = models.DateTimeField(auto_now_add=True)

    # ------------------------------------------------------------------
    # CLAIM TRACKING
    #
    # claimed_date / claimed_time: set when staff mark the item Claimed.
    # claimed_by_*: WHO claimed the item.
    # released_by: WHICH moderator/staff member released it.
    # ------------------------------------------------------------------
    claimed_date = models.DateField(null=True, blank=True)
    claimed_time = models.CharField(max_length=20, null=True, blank=True)
    claimed_by_name = models.CharField(max_length=100, blank=True, default='')
    claimed_by_contact = models.CharField(max_length=50, blank=True, default='')
    claimed_by_email = models.EmailField(max_length=254, blank=True, default='')
    released_by = models.CharField(max_length=150, blank=True, default='')

    # GAMIFICATION
    surrender_points_awarded = models.BooleanField(default=False)
    claimed_bonus_awarded = models.BooleanField(default=False)

    # TICKET SYSTEM
    ticket_code = models.CharField(max_length=20, unique=True, blank=True, null=True)

    def save(self, *args, **kwargs):
        is_new = self.pk is None

        super().save(*args, **kwargs)

        if is_new and not self.ticket_code:
            self.ticket_code = f"TKT-{self.id}-{uuid.uuid4().hex[:4].upper()}"
            super().save(update_fields=["ticket_code"])

    def __str__(self):
        return f"{self.title} {self.type} {self.status}"


class ItemImage(models.Model):
    """
    A single photo belonging to an ItemDetails entry. Items can have up to
    MAX_IMAGES_PER_ITEM (3) photos - enforced on the frontend by
    PhotoUpload.jsx AND on the backend in views.py (create/update). The
    legacy `ItemDetails.image` field is kept for older records.
    """
    item = models.ForeignKey(ItemDetails, related_name='images', on_delete=models.CASCADE)
    image = models.ImageField(upload_to='items_photos/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Photo for {self.item.title} (#{self.item.id})"