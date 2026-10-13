# gamification/models.py
from django.db import models


class LeaderboardPlayer(models.Model):
    student_id = models.CharField(max_length=30, unique=True)
    full_name = models.CharField(max_length=100)
    points = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.student_id} - {self.full_name} - {self.points}"


class PointTransaction(models.Model):
    REASONS = [
        ("SURRENDER_ITEM", "Surrendered item"),
        ("ITEM_CLAIMED", "Item claimed by owner"),
    ]

    player = models.ForeignKey(
        LeaderboardPlayer,
        on_delete=models.CASCADE,
        related_name="transactions"
    )
    points = models.PositiveIntegerField()
    reason = models.CharField(max_length=30, choices=REASONS)

    # NOTE: this used to be an IntegerField. The frontend actually sends a
    # ticket code string (e.g. "FND-2026-014") as item_id, not a numeric
    # id — casting that to int() in the view raised ValueError and was
    # being silently swallowed down to None. Every SURRENDER_ITEM
    # transaction for the same student then shared the same
    # (player, reason, item_id=None) tuple, which collided with the
    # unique_together below — so get_or_create() kept returning the FIRST
    # transaction ever created for that student instead of creating a new
    # one, and no new points were ever added after that first submission.
    # Storing it as a CharField (and no longer forcing it through int() in
    # the view) lets every distinct item actually get its own row.
    item_id = models.CharField(max_length=50, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [
            ("player", "reason", "item_id"),
        ]

    def __str__(self):
        return f"{self.player.student_id} - {self.reason} - {self.item_id} - {self.points}pts"


class LeaderboardSettings(models.Model):
    is_active = models.BooleanField(default=True)
    auto_mode = models.BooleanField(default=False)
    open_date = models.DateField(null=True, blank=True)
    close_date = models.DateField(null=True, blank=True)
    # Semester month ranges set on the Leaderboard Control page
    # ({"firstSem": {...}, "secondSem": {...}, "shortTerm": {...}}).
    # Empty means the page's built-in defaults are used.
    sem_config = models.JSONField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "Active" if self.is_active else "Inactive"