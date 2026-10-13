# One-time data fix: one leaderboard player per ID number.
#
# Older code saved some players as "12345678" and others as
# "12345678@slc-sflu.edu.ph", so one student could appear twice with their
# points split. This merges every player that shares the same ID number
# into a single row keyed by the bare ID number, moving all point history
# across. If both rows recorded points for the SAME item and reason, that
# duplicate is counted only once.
#
# Players with no digits in their ID are left untouched.

from django.db import migrations


def _id_number(raw):
    local_part = str(raw or "").split("@", 1)[0]
    return "".join(ch for ch in local_part if ch.isdigit())


def merge_players(apps, schema_editor):
    Player = apps.get_model("gamification", "LeaderboardPlayer")
    Transaction = apps.get_model("gamification", "PointTransaction")

    groups = {}
    for player in Player.objects.order_by("id"):
        id_number = _id_number(player.student_id)
        if id_number:
            groups.setdefault(id_number, []).append(player)

    for id_number, players in groups.items():
        keeper = next((p for p in players if p.student_id == id_number), players[0])
        others = [p for p in players if p.pk != keeper.pk]

        for other in others:
            duplicate_points = 0
            for tx in Transaction.objects.filter(player=other):
                already = Transaction.objects.filter(
                    player=keeper, reason=tx.reason, item_id=tx.item_id
                ).exists()
                if already:
                    duplicate_points += tx.points
                    tx.delete()
                else:
                    tx.player = keeper
                    tx.save(update_fields=["player"])

            keeper.points += max(0, other.points - duplicate_points)
            if not keeper.full_name and other.full_name:
                keeper.full_name = other.full_name
            other.delete()

        keeper.student_id = id_number
        keeper.save(update_fields=["student_id", "points", "full_name"])


class Migration(migrations.Migration):

    dependencies = [
        ("gamification", "0008_alter_pointtransaction_item_id"),
    ]

    operations = [
        migrations.RunPython(merge_players, migrations.RunPython.noop),
    ]
