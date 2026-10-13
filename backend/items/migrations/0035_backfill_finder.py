# ============================================================================
# items/migrations/0035_backfill_finder.py   (DATA migration)
#
# Run order:
#   1. python manage.py makemigrations items      -> creates the schema
#      migration that adds `finder` (yours is 0034_itemdetails_finder)
#   2. Save THIS file in items/migrations/ (rename the number if 0035 is
#      already taken, e.g. 0036_backfill_finder.py)
#   3. python manage.py migrate items
#
# What it does, for every ItemDetails row:
#   A) student_id is blank but `email` belongs to an Account
#        -> student_id = that account's email
#   B) student_id is set and matches an Account (case-insensitive)
#        -> finder = that account
#
# Rows with no matching Account are left unlinked and listed in the output.
# It never raises on a bad row, so one orphaned value can't fail the whole
# migration. `student_id` is never overwritten once filled.
# ============================================================================

from django.db import migrations


def backfill_finder(apps, schema_editor):
    ItemDetails = apps.get_model('items', 'ItemDetails')
    Account = apps.get_model('account', 'Account')  # change if AUTH_USER_MODEL differs

    # One query for all accounts instead of one query per item.
    accounts = {}
    for acc in Account.objects.exclude(email__isnull=True).exclude(email=''):
        accounts.setdefault(acc.email.strip().lower(), acc)

    filled_student_id = 0
    linked_finder = 0
    unmatched = []

    for item in ItemDetails.objects.filter(finder__isnull=True).iterator():
        update_fields = {}

        student_id = (item.student_id or '').strip()
        email = (item.email or '').strip()

        # A) blank student_id -> take it from the item's email if that email
        #    belongs to an account.
        if not student_id and email:
            acc = accounts.get(email.lower())
            if acc:
                student_id = acc.email
                update_fields['student_id'] = acc.email
                filled_student_id += 1

        # B) link the finder account.
        if student_id:
            acc = accounts.get(student_id.lower())
            if acc:
                update_fields['finder'] = acc
                linked_finder += 1
            else:
                unmatched.append((item.id, student_id))
        else:
            unmatched.append((item.id, ''))

        if update_fields:
            # .update() skips ItemDetails.save(), so ticket_code and other
            # save() logic are untouched.
            ItemDetails.objects.filter(pk=item.pk).update(**update_fields)

    print(f"\n[backfill_finder] student_id filled: {filled_student_id}, finder linked: {linked_finder}")
    if unmatched:
        print(f"[backfill_finder] {len(unmatched)} item(s) left unlinked (edit manually in admin):")
        for item_id, sid in unmatched:
            print(f"    ItemDetails id={item_id}  student_id={sid!r}")


def reverse_backfill_finder(apps, schema_editor):
    # Only clears `finder`. student_id values stay, since they were either
    # original data or harmless copies of the account email.
    ItemDetails = apps.get_model('items', 'ItemDetails')
    ItemDetails.objects.update(finder=None)


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0034_itemdetails_finder'),
    ]

    operations = [
        migrations.RunPython(backfill_finder, reverse_backfill_finder),
    ]