from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F
from django.db.models.functions import Greatest

from gamification.models import PointTransaction, LeaderboardPlayer
from items.models import ItemDetails


class Command(BaseCommand):
    help = "Replace ticket codes stored in PointTransaction.item_id with real item ids."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        converted = merged = unmatched = 0

        rows = (
            PointTransaction.objects.exclude(item_id__isnull=True)
            .exclude(item_id__regex=r"^\d+$")
            .select_related("player")
        )

        for tx in rows:
            item = ItemDetails.objects.filter(ticket_code__iexact=tx.item_id).first()
            if not item:
                unmatched += 1
                self.stdout.write(f"  No item for ticket '{tx.item_id}' (tx #{tx.id})")
                continue

            new_id = str(item.id)
            duplicate = PointTransaction.objects.filter(
                player=tx.player, reason=tx.reason, item_id=new_id
            ).exists()

            if duplicate:
                self.stdout.write(
                    f"  tx #{tx.id} duplicates the real-id row for item #{item.id}; "
                    f"removing it and deducting {tx.points} pt(s) from {tx.player.student_id}"
                )
                merged += 1
                if not dry_run:
                    with transaction.atomic():
                        LeaderboardPlayer.objects.filter(pk=tx.player_id).update(
                            points=Greatest(F("points") - tx.points, 0)
                        )
                        tx.delete()
            else:
                self.stdout.write(f"  tx #{tx.id}: '{tx.item_id}' -> '{new_id}'")
                converted += 1
                if not dry_run:
                    tx.item_id = new_id
                    tx.save(update_fields=["item_id"])

        self.stdout.write(self.style.SUCCESS(
            f"\nConverted: {converted} | Duplicates merged: {merged} | Unmatched: {unmatched}"
        ))
        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run without --dry-run to apply."))