# One-time data fix.
#
# An earlier migration left the literal text "student_id" in
# ItemDetails.student_id for every item instead of the finder's 8-digit
# Student ID. This migration rebuilds the real IDs where they can be
# recovered, in this order:
#
#   1. Points history: the leaderboard player who was awarded points for
#      this exact item (gamification PointTransaction.item_id).
#   2. Leaderboard players whose full name matches the item's poster_name
#      and who have exactly one 8-digit Student ID.
#   3. Accounts whose "first last" name matches poster_name and whose email
#      is an 8-digit school ID email.
#
# Anything that can't be recovered is cleared to '' (shown as "-") instead
# of keeping the fake "student_id" text. Items that already hold a real
# 8-digit ID are never touched.

import re

from django.conf import settings
from django.db import migrations

EIGHT_DIGITS = re.compile(r'^\d{8}$')
LEADING_DIGITS = re.compile(r'^(\d{8})(?:@|$)')


def _digits(value):
    match = LEADING_DIGITS.match((value or '').strip())
    return match.group(1) if match else None


def _norm(name):
    return ' '.join((name or '').lower().split())


def fix_student_ids(apps, schema_editor):
    ItemDetails = apps.get_model('items', 'ItemDetails')
    LeaderboardPlayer = apps.get_model('gamification', 'LeaderboardPlayer')
    PointTransaction = apps.get_model('gamification', 'PointTransaction')
    Account = apps.get_model(*settings.AUTH_USER_MODEL.split('.'))

    # item id -> Student ID from points history
    by_item = {}
    for tx in PointTransaction.objects.select_related('player').order_by('id'):
        sid = _digits(getattr(tx.player, 'student_id', ''))
        key = str(tx.item_id or '').strip()  # item_id is stored as text
        if key and sid and key not in by_item:
            by_item[key] = sid

    # name -> set of Student IDs (leaderboard players, then accounts)
    by_name = {}
    for player in LeaderboardPlayer.objects.all():
        sid = _digits(player.student_id)
        if sid and player.full_name:
            by_name.setdefault(_norm(player.full_name), set()).add(sid)

    by_account_name = {}
    for account in Account.objects.all():
        sid = _digits(account.email)
        full = _norm(f"{account.first_name} {account.last_name}")
        if sid and full:
            by_account_name.setdefault(full, set()).add(sid)

    for item in ItemDetails.objects.all():
        current = (item.student_id or '').strip()
        if EIGHT_DIGITS.match(current):
            continue  # already a real Student ID

        name = _norm(item.poster_name)
        recovered = by_item.get(str(item.id))
        if not recovered and len(by_name.get(name, ())) == 1:
            recovered = next(iter(by_name[name]))
        if not recovered and len(by_account_name.get(name, ())) == 1:
            recovered = next(iter(by_account_name[name]))

        item.student_id = recovered or ''
        item.save(update_fields=['student_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0035_rename_created_date_start_date_and_more'),
        ('gamification', '0008_alter_pointtransaction_item_id'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(fix_student_ids, migrations.RunPython.noop),
    ]