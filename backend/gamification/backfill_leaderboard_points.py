"""
Backfill leaderboard points for items that were surrendered or claimed
before ReportLostModal.jsx started sending `student_id`.

Two-step process, per Surrendered ItemDetails row:

1. If the item has no student_id, try to recover it by matching the
   item's stored email (which WAS always captured) against an Account.
   The Account model has no dedicated student_id field, so `username`
   (which defaults to the account's email on signup) is used as the
   identifier, same fallback ClaimModal.jsx / ReportLostModal.jsx use.
   Items whose email doesn't match any account are skipped and listed
   at the end so they can be fixed by hand if needed.

2. For items that now have a student_id, run the same award_points()
   calls items/views.py would have made at approval/claim time, guarded
   by the same surrender_points_awarded / claimed_bonus_awarded flags
   (and award_points' own unique_together constraint) so nothing already
   awarded gets double-counted.

Usage:
    python manage.py backfill_leaderboard_points            # apply changes
    python manage.py backfill_leaderboard_points --dry-run  # preview only
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from items.models import ItemDetails
from account.models import Account
from gamification.services import award_points, get_item_points, CLAIMED_BONUS_POINTS


class Command(BaseCommand):
    help = "Backfill missing leaderboard points for surrendered/claimed items."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        # ------------------------------------------------------------
        # STEP 1 — recover missing student_id from the item's email
        # ------------------------------------------------------------
        missing_id_items = ItemDetails.objects.filter(type="Surrendered").filter(
            Q(student_id__isnull=True) | Q(student_id="")
        )

        recovered = 0
        unmatched = []

        for item in missing_id_items:
            if not item.email:
                unmatched.append(item)
                continue

            account = Account.objects.filter(email__iexact=item.email).first()
            if not account:
                unmatched.append(item)
                continue

            identifier = account.username or account.email
            self.stdout.write(
                f"  Recovered student_id for item #{item.id} \"{item.title}\" "
                f"({item.email}) -> {identifier}"
            )
            recovered += 1

            if not dry_run:
                item.student_id = identifier
                item.save(update_fields=["student_id"])

        self.stdout.write(
            self.style.SUCCESS(f"\nRecovered student_id on {recovered} item(s).")
        )
        if unmatched:
            self.stdout.write(
                self.style.WARNING(
                    f"{len(unmatched)} item(s) have no matching account email and were skipped:"
                )
            )
            for item in unmatched:
                self.stdout.write(
                    f"  - item #{item.id} \"{item.title}\" (email: {item.email or 'none'})"
                )

        # ------------------------------------------------------------
        # STEP 2 — award points for items that now have a student_id
        # ------------------------------------------------------------
        surrender_awarded = 0
        claim_bonus_awarded = 0

        eligible_items = ItemDetails.objects.filter(type="Surrendered").exclude(
            Q(student_id__isnull=True) | Q(student_id="")
        )

        for item in eligible_items:
            # Surrender points
            if item.status == "Approved" and not item.surrender_points_awarded:
                points = get_item_points(item)
                self.stdout.write(
                    f"  Awarding {points} surrender point(s) to {item.poster_name} "
                    f"({item.student_id}) for item #{item.id}"
                )
                surrender_awarded += 1

                if not dry_run:
                    with transaction.atomic():
                        award_points(
                            student_id=item.student_id,
                            full_name=item.poster_name,
                            points=points,
                            reason="SURRENDER_ITEM",
                            item_id=item.id,
                        )
                        item.surrender_points_awarded = True
                        item.save(update_fields=["surrender_points_awarded"])

            # Claimed bonus
            if item.status == "Claimed" and not item.claimed_bonus_awarded:
                self.stdout.write(
                    f"  Awarding {CLAIMED_BONUS_POINTS} claim bonus point(s) to "
                    f"{item.poster_name} ({item.student_id}) for item #{item.id}"
                )
                claim_bonus_awarded += 1

                if not dry_run:
                    with transaction.atomic():
                        award_points(
                            student_id=item.student_id,
                            full_name=item.poster_name,
                            points=CLAIMED_BONUS_POINTS,
                            reason="ITEM_CLAIMED",
                            item_id=item.id,
                        )
                        item.claimed_bonus_awarded = True
                        item.save(update_fields=["claimed_bonus_awarded"])

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSurrender points awarded on {surrender_awarded} item(s)."
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Claim bonus points awarded on {claim_bonus_awarded} item(s)."
            )
        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "\nDry run complete. Re-run without --dry-run to apply these changes."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS("\nBackfill complete."))